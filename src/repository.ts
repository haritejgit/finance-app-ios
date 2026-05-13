import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "./firebase";
import { Customer, Loan, Payment, PaymentMode, Village } from "./types";

const coll = {
  villages: collection(db, "villages"),
  customers: collection(db, "customers"),
  loans: collection(db, "loans"),
  payments: collection(db, "payments"),
};

// Simple in-memory cache for better performance
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(userId: string, type: string, id?: string) {
  return id ? `${userId}:${type}:${id}` : `${userId}:${type}`;
}

function getCached<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }
  return null;
}

function setCache(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() });
}

function clearCache() {
  cache.clear();
}

function stripUndefined<T extends Record<string, any>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function normalizeAadhar(aadhar?: string) {
  return (aadhar ?? "").replace(/\D/g, "").trim();
}

function id() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function getVillages(userId: string, useCache = true) {
  const cacheKey = getCacheKey(userId, "villages");
  if (useCache) {
    const cached = getCached<Village[]>(cacheKey);
    if (cached) return cached;
  }
  const q = query(coll.villages, where("userId", "==", userId));
  const snap = await getDocs(q);
  const villages = snap.docs.map((d) => d.data() as Village);
  setCache(cacheKey, villages);
  return villages;
}

export async function getVillageById(villageId: string) {
  const snap = await getDoc(doc(db, "villages", villageId));
  return snap.exists() ? (snap.data() as Village) : null;
}

export async function addVillage(userId: string, name: string, dayOfWeek: string, shift: string) {
  const village: Village = { id: id(), name, dayOfWeek, shift: shift as any, userId };
  await setDoc(doc(db, "villages", village.id), stripUndefined(village));
  clearCache();
}

export async function deleteVillage(villageId: string) {
  await deleteDoc(doc(db, "villages", villageId));
  clearCache();
}

export async function updateVillageDayShift(villageId: string, dayOfWeek: string, shift: string) {
  await updateDoc(doc(db, "villages", villageId), {
    dayOfWeek,
    shift,
  });
  clearCache();
}

export async function getCustomers(userId: string, villageId: string, useCache = true) {
  const cacheKey = getCacheKey(userId, "customers", villageId);
  if (useCache) {
    const cached = getCached<Customer[]>(cacheKey);
    if (cached) return cached;
  }
  const q = query(
    coll.customers,
    where("userId", "==", userId),
    where("villageId", "==", villageId),
    where("isActive", "==", true)
  );
  const snap = await getDocs(q);
  const customers = snap.docs.map((d) => d.data() as Customer);
  setCache(cacheKey, customers);
  return customers;
}

export type CustomerSearchResult = Customer & {
  villageName?: string;
  villageDayOfWeek?: string;
  villageShift?: string;
};

export async function getAllActiveCustomersWithVillages(userId: string): Promise<CustomerSearchResult[]> {
  const [customersSnap, villagesSnap] = await Promise.all([
    getDocs(query(coll.customers, where("userId", "==", userId))),
    getDocs(query(coll.villages, where("userId", "==", userId))),
  ]);

  const villagesById = new Map(
    villagesSnap.docs.map((d) => {
      const village = d.data() as Village;
      return [village.id, village];
    })
  );

  return customersSnap.docs
    .map((d) => d.data() as Customer)
    .filter((customer) => customer.isActive !== false)
    .map((customer) => {
      const village = villagesById.get(customer.villageId);
      return {
        ...customer,
        villageName: village?.name,
        villageDayOfWeek: village?.dayOfWeek,
        villageShift: village?.shift,
      };
    })
    .sort((a, b) => a.numericalId - b.numericalId);
}

export async function getNextNumericalId(userId: string, dayOfWeek: string, shift: string) {
  // Scope by route (day + shift), not by village, so all villages in a shift
  // share one sequence and gaps from deleted customers are reused.
  const [villagesSnap, customersSnap] = await Promise.all([
    getDocs(query(coll.villages, where("userId", "==", userId), where("dayOfWeek", "==", dayOfWeek), where("shift", "==", shift))),
    getDocs(query(coll.customers, where("userId", "==", userId))),
  ]);
  const routeVillageIds = new Set(
    villagesSnap.docs.map((d) => {
      const village = d.data() as Village;
      return village.id;
    })
  );
  const assignedIds = new Set<number>();
  customersSnap.docs.forEach((d) => {
    const c = d.data() as Customer;
    if (routeVillageIds.has(c.villageId) && Number.isInteger(c.numericalId) && c.numericalId > 0) {
      assignedIds.add(c.numericalId);
    }
  });

  let nextId = 1;
  while (assignedIds.has(nextId)) {
    nextId += 1;
  }
  return nextId;
}

export async function normalizeCustomerNumericalIdsForAllShifts(userId: string) {
  const [villagesSnap, customersSnap] = await Promise.all([
    getDocs(query(coll.villages, where("userId", "==", userId))),
    getDocs(query(coll.customers, where("userId", "==", userId))),
  ]);

  const villageRouteById = new Map<string, string>();
  villagesSnap.docs.forEach((d) => {
    const village = d.data() as Village;
    villageRouteById.set(village.id, `${village.dayOfWeek}:${village.shift}`);
  });

  const customersByRoute = new Map<string, { ref: DocumentReference; customer: Customer }[]>();
  customersSnap.docs.forEach((customerDoc) => {
    const customer = customerDoc.data() as Customer;
    if (customer.isActive === false) return;

    const routeKey = villageRouteById.get(customer.villageId);
    if (!routeKey) return;

    const routeCustomers = customersByRoute.get(routeKey) ?? [];
    routeCustomers.push({ ref: customerDoc.ref, customer });
    customersByRoute.set(routeKey, routeCustomers);
  });

  const updates: { ref: DocumentReference; numericalId: number }[] = [];
  customersByRoute.forEach((routeCustomers) => {
    routeCustomers
      .sort((a, b) => {
        const idDelta = a.customer.numericalId - b.customer.numericalId;
        if (idDelta !== 0) return idDelta;
        const createdDelta = a.customer.createdAt - b.customer.createdAt;
        if (createdDelta !== 0) return createdDelta;
        return a.customer.name.localeCompare(b.customer.name);
      })
      .forEach(({ ref, customer }, index) => {
        const nextNumericalId = index + 1;
        if (customer.numericalId !== nextNumericalId) {
          updates.push({ ref, numericalId: nextNumericalId });
        }
      });
  });

  for (let i = 0; i < updates.length; i += 450) {
    const batch = writeBatch(db);
    updates.slice(i, i + 450).forEach(({ ref, numericalId }) => {
      batch.update(ref, { numericalId });
    });
    await batch.commit();
  }

  if (updates.length > 0) {
    clearCache();
  }

  return updates.length;
}

export async function addCustomerWithLoan(
  userId: string,
  villageId: string,
  dayOfWeek: string,
  shift: string,
  input: Omit<Customer, "id" | "userId" | "villageId" | "numericalId" | "isActive" | "createdAt">,
  principalAmount: number,
  startDate: number
) {
  const numericalId = await getNextNumericalId(userId, dayOfWeek, shift);
  const customer: Customer = {
    id: id(),
    numericalId,
    villageId,
    userId,
    isActive: true,
    createdAt: Date.now(),
    ...input,
  };
  await setDoc(doc(db, "customers", customer.id), stripUndefined(customer));
  const interestAmount = principalAmount * 0.2;
  const totalPayable = principalAmount + interestAmount;
  const loan: Loan = {
    id: id(),
    customerId: customer.id,
    principalAmount,
    interestAmount,
    totalPayable,
    balanceAmount: totalPayable,
    userId,
    startDate,
    status: "ACTIVE",
  };
  await setDoc(doc(db, "loans", loan.id), stripUndefined(loan));
  clearCache();
  return customer;
}

export async function getCustomerById(customerId: string) {
  const snap = await getDoc(doc(db, "customers", customerId));
  return snap.exists() ? (snap.data() as Customer) : null;
}

export async function getActiveLoan(userId: string, customerId: string) {
  const q = query(
    coll.loans,
    where("userId", "==", userId),
    where("customerId", "==", customerId),
    where("status", "==", "ACTIVE")
  );
  const snap = await getDocs(q);
  return snap.docs[0]?.data() as Loan | undefined;
}

export async function getActiveLoansByCustomerIds(userId: string, customerIds: string[]) {
  const wantedCustomerIds = new Set(customerIds);
  if (wantedCustomerIds.size === 0) return {} as Record<string, Loan>;

  const q = query(
    coll.loans,
    where("userId", "==", userId),
    where("status", "==", "ACTIVE")
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data() as Loan)
    .filter((loan) => wantedCustomerIds.has(loan.customerId))
    .reduce((loansByCustomer, loan) => {
      loansByCustomer[loan.customerId] = loan;
      return loansByCustomer;
    }, {} as Record<string, Loan>);
}

export async function updateLoan(loan: Loan, newPrincipalAmount: number, newStartDate: number) {
  // Recalculate interest and totals based on new principal
  const interestAmount = newPrincipalAmount * 0.2;
  const totalPayable = newPrincipalAmount + interestAmount;
  
  // Calculate how much has been paid so far
  const paidSoFar = loan.totalPayable - loan.balanceAmount;
  const newBalanceAmount = totalPayable - paidSoFar;
  
  const updatedLoan: Loan = {
    ...loan,
    principalAmount: newPrincipalAmount,
    interestAmount: interestAmount,
    totalPayable: totalPayable,
    balanceAmount: newBalanceAmount,
    startDate: newStartDate,
  };
  
  await setDoc(doc(db, "loans", loan.id), stripUndefined(updatedLoan));
  clearCache();
  return updatedLoan;
}

export async function getPaymentsForCustomer(userId: string, customerId: string) {
  // Fast path for new writes where payment includes customerId.
  const fastQ = query(
    coll.payments,
    where("userId", "==", userId),
    where("customerId", "==", customerId)
  );
  const fastSnap = await getDocs(fastQ);
  if (!fastSnap.empty) {
    return fastSnap.docs
      .map((d) => d.data() as Payment)
      .sort((a, b) => b.paymentDate - a.paymentDate);
  }

  // Backward-compatible fallback for existing legacy payments without customerId.
  const loansQ = query(coll.loans, where("userId", "==", userId), where("customerId", "==", customerId));
  const loansSnap = await getDocs(loansQ);
  const loanIds = new Set(loansSnap.docs.map((d) => (d.data() as Loan).id));
  if (loanIds.size === 0) return [] as Payment[];
  const legacyQ = query(coll.payments, where("userId", "==", userId));
  const legacySnap = await getDocs(legacyQ);
  return legacySnap.docs
    .map((d) => d.data() as Payment)
    .filter((p) => loanIds.has(p.loanId))
    .sort((a, b) => b.paymentDate - a.paymentDate);
}

export async function getPaymentStatusesForCustomersToday(userId: string, customerIds: string[]) {
  const wantedCustomerIds = new Set(customerIds);
  if (wantedCustomerIds.size === 0) return {} as Record<string, "paid" | "due" | "none">;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  const startMs = start.getTime();
  const endMs = end.getTime();

  const [paymentsSnap, loansSnap] = await Promise.all([
    getDocs(query(coll.payments, where("userId", "==", userId))),
    getDocs(query(coll.loans, where("userId", "==", userId))),
  ]);

  const customerIdByLoanId = new Map(
    loansSnap.docs
      .map((d) => d.data() as Loan)
      .filter((loan) => wantedCustomerIds.has(loan.customerId))
      .map((loan) => [loan.id, loan.customerId])
  );
  const statuses = Object.fromEntries(
    customerIds.map((customerId) => [customerId, "none" as "paid" | "due" | "none"])
  );

  paymentsSnap.docs
    .map((d) => d.data() as Payment)
    .forEach((payment) => {
      const paymentDate = toMillis(payment.paymentDate);
      if (paymentDate < startMs || paymentDate > endMs) return;

      const customerId = payment.customerId ?? customerIdByLoanId.get(payment.loanId);
      if (!customerId || !wantedCustomerIds.has(customerId)) return;

      if (payment.paymentType === "DUE") {
        if (statuses[customerId] !== "paid") {
          statuses[customerId] = "due";
        }
      } else {
        statuses[customerId] = "paid";
      }
    });

  return statuses;
}

export async function addPayment(loan: Loan, amountPaid: number, paymentDate: number, mode: PaymentMode) {
  const payment: Payment = {
    id: id(),
    loanId: loan.id,
    customerId: loan.customerId,
    amountPaid,
    paymentDate,
    weekNumber: 0,
    paymentType: "REGULAR",
    paymentMode: mode,
    userId: loan.userId,
  };
  await setDoc(doc(db, "payments", payment.id), stripUndefined(payment));
  const newBalance = Math.max(0, loan.balanceAmount - amountPaid);
  await updateDoc(doc(db, "loans", loan.id), {
    balanceAmount: newBalance,
    status: newBalance <= 0 ? "CLOSED" : "ACTIVE",
  });
  clearCache();
}

export async function updatePayment(payment: Payment, newAmount: number, newDate: number, newMode: PaymentMode) {
  const oldAmount = payment.amountPaid;
  const updatedPayment: Payment = {
    ...payment,
    amountPaid: newAmount,
    paymentDate: newDate,
    paymentMode: newMode,
  };
  await updateDoc(doc(db, "payments", payment.id), stripUndefined(updatedPayment));
  
  // Adjust loan balance
  const loanSnap = await getDoc(doc(db, "loans", payment.loanId));
  if (loanSnap.exists()) {
    const loan = loanSnap.data() as Loan;
    const balanceDiff = oldAmount - newAmount;
    const newBalance = Math.max(0, loan.balanceAmount + balanceDiff);
    await updateDoc(doc(db, "loans", payment.loanId), {
      balanceAmount: newBalance,
      status: newBalance <= 0 ? "CLOSED" : "ACTIVE",
    });
  }
  clearCache();
}

export async function deletePayment(payment: Payment) {
  await deleteDoc(doc(db, "payments", payment.id));
  
  // Restore loan balance
  const loanSnap = await getDoc(doc(db, "loans", payment.loanId));
  if (loanSnap.exists()) {
    const loan = loanSnap.data() as Loan;
    const newBalance = loan.balanceAmount + payment.amountPaid;
    await updateDoc(doc(db, "loans", payment.loanId), {
      balanceAmount: newBalance,
      status: newBalance <= 0 ? "CLOSED" : "ACTIVE",
    });
  }
  clearCache();
}

export async function markDue(loan: Loan, paymentDate: number) {
  const payment: Payment = {
    id: id(),
    loanId: loan.id,
    customerId: loan.customerId,
    amountPaid: 0,
    paymentDate,
    weekNumber: 0,
    paymentType: "DUE",
    paymentMode: "CASH",
    userId: loan.userId,
  };
  await setDoc(doc(db, "payments", payment.id), stripUndefined(payment));
  clearCache();
}

export async function renewLoan(loan: Loan, newPrincipal: number, date: number) {
  if (loan.balanceAmount > 0) {
    const closure: Payment = {
      id: id(),
      loanId: loan.id,
      customerId: loan.customerId,
      amountPaid: loan.balanceAmount,
      paymentDate: date,
      weekNumber: 0,
      paymentType: "RENEWAL_CLOSURE",
      paymentMode: "CASH",
      notes: "Loan renewed - old balance cleared",
      userId: loan.userId,
    };
    await setDoc(doc(db, "payments", closure.id), stripUndefined(closure));
  }
  await updateDoc(doc(db, "loans", loan.id), { balanceAmount: 0, status: "RENEWED" });
  const interest = newPrincipal * 0.2;
  const totalPayable = newPrincipal + interest;
  const newLoan: Loan = {
    id: id(),
    customerId: loan.customerId,
    principalAmount: newPrincipal,
    interestAmount: interest,
    totalPayable,
    balanceAmount: totalPayable,
    userId: loan.userId,
    startDate: date,
    status: "ACTIVE",
  };
  await setDoc(doc(db, "loans", newLoan.id), stripUndefined(newLoan));
  clearCache();
}

export async function getCollectionToday(userId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  const q = query(coll.payments, where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data() as Payment)
    .filter((p) => p.paymentDate >= start.getTime() && p.paymentDate <= end.getTime())
    .reduce((sum, p) => sum + p.amountPaid, 0);
}

function toMillis(value: any) {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  return 0;
}

function toAmount(value: any) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export async function getTodayDashboardStats(userId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  const startMs = start.getTime();
  const endMs = end.getTime();

  const [paymentsSnap, loansSnap, customersSnap] = await Promise.all([
    getDocs(query(coll.payments, where("userId", "==", userId))),
    getDocs(query(coll.loans, where("userId", "==", userId))),
    getDocs(query(coll.customers, where("userId", "==", userId))),
  ]);

  const activeCustomerIds = new Set(
    customersSnap.docs
      .map((d) => d.data() as Customer)
      .filter((customer) => customer.isActive !== false)
      .map((customer) => customer.id)
  );
  const activeLoanCustomerById = new Map<string, string>();
  const activeLoans = loansSnap.docs
    .map((d) => d.data() as Loan)
    .filter((loan) => activeCustomerIds.has(loan.customerId));
  activeLoans.forEach((loan) => activeLoanCustomerById.set(loan.id, loan.customerId));

  const collectionToday = paymentsSnap.docs
    .map((d) => d.data() as Payment)
    .filter((payment) => {
      const paymentDate = toMillis(payment.paymentDate);
      const customerId = payment.customerId ?? activeLoanCustomerById.get(payment.loanId);
      return (
        paymentDate >= startMs &&
        paymentDate <= endMs &&
        payment.paymentType !== "DUE" &&
        !!customerId &&
        activeCustomerIds.has(customerId)
      );
    })
    .reduce((sum, payment) => sum + toAmount(payment.amountPaid), 0);

  const distributedTodayRaw = activeLoans
    .filter((loan) => {
      const startDate = toMillis(loan.startDate);
      return startDate >= startMs && startDate <= endMs;
    })
    .reduce((sum, loan) => sum + toAmount(loan.principalAmount), 0);
  
  // Deduct 20 Rs per 1000 Rs distributed
  const distributedToday = distributedTodayRaw - (Math.floor(distributedTodayRaw / 1000) * 20);

  return { collectionToday, distributedToday };
}

export async function getPaymentsByDate(userId: string, startDate: number, endDate: number) {
  const q = query(coll.payments, where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data() as Payment)
    .filter((p) => p.paymentDate >= startDate && p.paymentDate <= endDate);
}

export async function updateCustomer(customer: Customer) {
  await setDoc(doc(db, "customers", customer.id), stripUndefined(customer));
  clearCache();
}

export async function deleteCustomer(userId: string, customerId: string) {
  // Delete all loans associated with this customer
  const loansQ = query(coll.loans, where("userId", "==", userId), where("customerId", "==", customerId));
  const loansSnap = await getDocs(loansQ);
  
  // Delete all payments for these loans first
  for (const loanDoc of loansSnap.docs) {
    const loanId = loanDoc.id;
    const paymentsQ = query(coll.payments, where("userId", "==", userId), where("loanId", "==", loanId));
    const paymentsSnap = await getDocs(paymentsQ);
    
    // Delete all payments for this loan
    for (const paymentDoc of paymentsSnap.docs) {
      await deleteDoc(paymentDoc.ref);
    }
    
    // Delete the loan
    await deleteDoc(loanDoc.ref);
  }

  // Delete any stray payments attached directly to the customer
  const strayPaymentsQ = query(coll.payments, where("userId", "==", userId), where("customerId", "==", customerId));
  const strayPaymentsSnap = await getDocs(strayPaymentsQ);
  for (const paymentDoc of strayPaymentsSnap.docs) {
    await deleteDoc(paymentDoc.ref);
  }
  
  // Finally delete the customer
  await deleteDoc(doc(db, "customers", customerId));
  clearCache();
}

export async function getCustomerByAadhar(userId: string, aadhar: string, excludeCustomerId?: string): Promise<Customer | null> {
  const normalizedAadhar = normalizeAadhar(aadhar);
  if (!normalizedAadhar) return null;

  const q = query(coll.customers, where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data() as Customer)
    .find((customer) => 
      customer.isActive !== false &&
      customer.id !== excludeCustomerId &&
      normalizeAadhar(customer.aadhar) === normalizedAadhar
    ) ?? null;
}

export async function getCustomerLoanSummary(userId: string, aadhar: string): Promise<{customer: Customer | null, hasActiveLoan: boolean}> {
  const customer = await getCustomerByAadhar(userId, aadhar);
  if (!customer) {
    return { customer: null, hasActiveLoan: false };
  }
  
  const activeLoan = await getActiveLoan(userId, customer.id);
  return { customer, hasActiveLoan: !!activeLoan };
}
