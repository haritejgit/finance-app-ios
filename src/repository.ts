import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  addDoc,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { BlockedAadhaar, Customer, Loan, Payment, PaymentMode, Village } from "./types";
import { getLoanDistributedAmount, getLoanPrincipalAmount, isRealCollectionPayment, loanWeekNumber, money, toMillis, weekStart } from "./business-logic";
import { filterCustomersWithVillage } from "./utils";

const coll = {
  villages: collection(db, "villages"),
  customers: collection(db, "customers"),
  loans: collection(db, "loans"),
  payments: collection(db, "payments"),
  blockedAadhaar: collection(db, "blockedAadhaar"),
  balancingFund: collection(db, "balancingFund"),
  investments: collection(db, "investments"),
  expenses: collection(db, "expenses"),
};

// Simple in-memory cache for better performance
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CUSTOMER_PAGE_CACHE_PREFIX = "customerPage:";
const PAGE_SIZE = 20;
let lastCustomerPageDoc: QueryDocumentSnapshot | null = null;

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

function cleanText(value?: string) {
  return (value ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
}

function cleanPhone(value?: string) {
  return (value ?? "").replace(/[^\d+]/g, "").trim();
}

function assertPositiveAmount(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
}

function sanitizeCustomerInput<T extends Partial<Customer>>(input: T): T {
  return {
    ...input,
    name: cleanText(input.name),
    phone: cleanPhone(input.phone),
    aadhar: normalizeAadhar(input.aadhar),
    locationDesc: cleanText(input.locationDesc),
    coName: cleanText(input.coName),
  } as T;
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
  const villageName = cleanText(name);
  if (!villageName) throw new Error("Village name is required.");
  const village: Village = { id: id(), name: villageName, dayOfWeek, shift: shift as any, userId };
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

export async function updateVillageName(villageId: string, name: string) {
  const villageName = cleanText(name);
  if (!villageName) throw new Error("Village name is required.");
  await updateDoc(doc(db, "villages", villageId), {
    name: villageName,
  });
  clearCache();
}

export async function getCustomers(userId: string, villageId: string, useCache = true) {
  const cacheKey = getCacheKey(userId, "customers", villageId);
  if (useCache) {
    const cached = getCached<Customer[]>(cacheKey);
    if (cached) return cached;
  }
  await normalizeCustomerNumericalIdsForVillage(userId, villageId);
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

export type CustomerPage = {
  customers: Customer[];
  cursor: QueryDocumentSnapshot | null;
  hasMore: boolean;
};

export async function getCustomersPage(
  userId: string,
  villageId: string,
  pageSize = 20,
  cursor?: QueryDocumentSnapshot | null
): Promise<CustomerPage> {
  const storageKey = `${CUSTOMER_PAGE_CACHE_PREFIX}${userId}:${villageId}:first`;
  const constraints = [
    where("userId", "==", userId),
    where("villageId", "==", villageId),
    where("isActive", "==", true),
    orderBy("numericalId", "asc"),
  ];
  const pageQuery = cursor
    ? query(coll.customers, ...constraints, startAfter(cursor), limit(pageSize + 1))
    : query(coll.customers, ...constraints, limit(pageSize + 1));
  try {
    const snap = await getDocs(pageQuery);
    const docs = snap.docs.slice(0, pageSize);
    const customers = docs.map((d) => d.data() as Customer);
    if (!cursor) {
      await AsyncStorage.setItem(storageKey, JSON.stringify(customers)).catch(() => undefined);
    }
    return {
      customers,
      cursor: docs[docs.length - 1] ?? null,
      hasMore: snap.docs.length > pageSize,
    };
  } catch (error) {
    if (!cursor) {
      const cached = await AsyncStorage.getItem(storageKey).catch(() => null);
      if (cached) {
        return { customers: JSON.parse(cached) as Customer[], cursor: null, hasMore: false };
      }
    }
    throw error;
  }
}

export async function fetchCustomersPage(villageId: string, reset = false) {
  if (reset) lastCustomerPageDoc = null;

  const baseConstraints = [
    where("villageId", "==", villageId),
    where("isActive", "==", true),
    orderBy("numericalId", "asc"),
  ];

  const pageQuery = lastCustomerPageDoc
    ? query(coll.customers, ...baseConstraints, startAfter(lastCustomerPageDoc), limit(PAGE_SIZE))
    : query(coll.customers, ...baseConstraints, limit(PAGE_SIZE));

  const snap = await getDocs(pageQuery);
  lastCustomerPageDoc = snap.docs[snap.docs.length - 1] ?? null;
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as object) }));
}

export type CustomerSearchResult = Customer & {
  villageName?: string;
  villageDayOfWeek?: string;
  villageShift?: string;
};

export async function getAllActiveCustomersWithVillages(userId: string): Promise<CustomerSearchResult[]> {
  const [customersSnap, villagesSnap] = await Promise.all([
    getDocs(query(coll.customers, where("userId", "==", userId), limit(1500))),
    getDocs(query(coll.villages, where("userId", "==", userId), limit(500))),
  ]);

  const villagesById = new Map(
    villagesSnap.docs.map((d) => {
      const village = d.data() as Village;
      return [village.id, village];
    })
  );

  return customersSnap.docs
    .map((d) => d.data() as Customer)
    // NOTE: UI-only filter. Customer documents in Firestore are NOT modified.
    .filter((customer) => filterCustomersWithVillage([customer]).length > 0)
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

export async function getNextNumericalId(userId: string, villageId: string) {
  // Scope by village so the visible customer list has consecutive book numbers.
  const customersSnap = await getDocs(query(coll.customers, where("userId", "==", userId), where("villageId", "==", villageId)));
  const assignedIds = new Set<number>();
  customersSnap.docs.forEach((d) => {
    const c = d.data() as Customer;
    if (c.isActive !== false && Number.isInteger(c.numericalId) && c.numericalId > 0) {
      assignedIds.add(c.numericalId);
    }
  });

  let nextId = 1;
  while (assignedIds.has(nextId)) {
    nextId += 1;
  }
  return nextId;
}

async function normalizeCustomerGroup(customers: { ref: DocumentReference; customer: Customer }[]) {
  const updates: { ref: DocumentReference; numericalId: number }[] = [];
  customers
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

export async function normalizeCustomerNumericalIdsForVillage(userId: string, villageId: string) {
  const customersSnap = await getDocs(query(coll.customers, where("userId", "==", userId), where("villageId", "==", villageId)));
  return normalizeCustomerGroup(
    customersSnap.docs
      .map((customerDoc) => ({ ref: customerDoc.ref, customer: customerDoc.data() as Customer }))
      .filter(({ customer }) => customer.isActive !== false)
  );
}

export async function normalizeCustomerNumericalIdsForAllShifts(userId: string) {
  const customersSnap = await getDocs(query(coll.customers, where("userId", "==", userId)));

  const customersByVillage = new Map<string, { ref: DocumentReference; customer: Customer }[]>();
  customersSnap.docs.forEach((customerDoc) => {
    const customer = customerDoc.data() as Customer;
    if (customer.isActive === false) return;

    const villageCustomers = customersByVillage.get(customer.villageId) ?? [];
    villageCustomers.push({ ref: customerDoc.ref, customer });
    customersByVillage.set(customer.villageId, villageCustomers);
  });

  let updatedCount = 0;
  for (const villageCustomers of customersByVillage.values()) {
    updatedCount += await normalizeCustomerGroup(villageCustomers);
  }

  return updatedCount;
}

async function getEligibleCustomerIds(userId: string) {
  const [customersSnap, villagesSnap] = await Promise.all([
    getDocs(query(coll.customers, where("userId", "==", userId), limit(1500))),
    getDocs(query(coll.villages, where("userId", "==", userId), limit(500))),
  ]);
  const villageIds = new Set(villagesSnap.docs.map((d) => (d.data() as Village).id));
  return new Set(
    filterCustomersWithVillage(customersSnap.docs.map((d) => d.data() as Customer))
      .filter((customer) => customer.isActive !== false && villageIds.has(customer.villageId))
      .map((customer) => customer.id)
  );
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
  assertPositiveAmount(principalAmount, "Loan amount");
  const sanitizedInput = sanitizeCustomerInput(input);
  if (!sanitizedInput.name) throw new Error("Customer name is required.");
  if (!sanitizedInput.phone) throw new Error("Customer phone is required.");
  const numericalId = await getNextNumericalId(userId, villageId);
  const customer: Customer = {
    id: id(),
    numericalId,
    villageId,
    userId,
    isActive: true,
    createdAt: Date.now(),
    ...sanitizedInput,
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
    where("status", "==", "ACTIVE"),
    limit(1500)
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
  assertPositiveAmount(newPrincipalAmount, "Loan amount");
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
    where("customerId", "==", customerId),
    limit(500)
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
  const legacyQ = query(coll.payments, where("userId", "==", userId), limit(1500));
  const legacySnap = await getDocs(legacyQ);
  return legacySnap.docs
    .map((d) => d.data() as Payment)
    .filter((p) => loanIds.has(p.loanId))
    .sort((a, b) => b.paymentDate - a.paymentDate);
}

export async function getPaymentStatusesForCustomersThisWeek(userId: string, customerIds: string[]) {
  const wantedCustomerIds = new Set(customerIds);
  if (wantedCustomerIds.size === 0) return {} as Record<string, "paid" | "due" | "none">;

  const startMs = weekStart(Date.now());
  const endMs = startMs + 7 * 24 * 60 * 60 * 1000 - 1;

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

export async function getLastRegularPaymentDatesForCustomers(userId: string, customerIds: string[]) {
  const wantedCustomerIds = new Set(customerIds);
  if (wantedCustomerIds.size === 0) return {} as Record<string, { lastPaymentDate: number; paidLastWeek: boolean }>;

  const [paymentsSnap, loansSnap] = await Promise.all([
    getDocs(query(coll.payments, where("userId", "==", userId), limit(1500))),
    getDocs(query(coll.loans, where("userId", "==", userId), limit(1500))),
  ]);

  const customerIdByLoanId = new Map(
    loansSnap.docs
      .map((d) => d.data() as Loan)
      .filter((loan) => wantedCustomerIds.has(loan.customerId))
      .map((loan) => [loan.id, loan.customerId])
  );

  const currentMonday = weekStart(Date.now());
  const prevWeekStart = currentMonday - 7 * 24 * 60 * 60 * 1000;
  const prevWeekEnd = currentMonday - 1;

  const latest: Record<string, { lastPaymentDate: number; paidLastWeek: boolean }> = {};
  customerIds.forEach((id) => {
    latest[id] = { lastPaymentDate: 0, paidLastWeek: false };
  });

  paymentsSnap.docs
    .map((d) => d.data() as Payment)
    .filter(isRealCollectionPayment)
    .forEach((payment) => {
      const customerId = payment.customerId ?? customerIdByLoanId.get(payment.loanId);
      if (!customerId || !wantedCustomerIds.has(customerId)) return;
      const paymentDate = toMillis(payment.paymentDate);
      if (paymentDate > latest[customerId].lastPaymentDate) {
        latest[customerId].lastPaymentDate = paymentDate;
      }
      if (paymentDate >= prevWeekStart && paymentDate <= prevWeekEnd) {
        latest[customerId].paidLastWeek = true;
      }
    });

  return latest;
}

export async function addPayment(loan: Loan, amountPaid: number, paymentDate: number, mode: PaymentMode) {
  assertPositiveAmount(amountPaid, "Payment amount");
  const payment: Payment = {
    id: id(),
    loanId: loan.id,
    customerId: loan.customerId,
    amountPaid,
    paymentDate,
    weekNumber: loanWeekNumber(loan.startDate, paymentDate),
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

export async function addPaymentsBatch(
  entries: { loan: Loan; amountPaid: number; paymentDate: number; mode: PaymentMode }[]
) {
  if (entries.length === 0) return 0;
  const batch = writeBatch(db);
  entries.forEach(({ loan, amountPaid, paymentDate, mode }) => {
    assertPositiveAmount(amountPaid, "Payment amount");
    const payment: Payment = {
      id: id(),
      loanId: loan.id,
      customerId: loan.customerId,
      amountPaid,
      paymentDate,
      weekNumber: loanWeekNumber(loan.startDate, paymentDate),
      paymentType: "REGULAR",
      paymentMode: mode,
      userId: loan.userId,
    };
    const newBalance = Math.max(0, loan.balanceAmount - amountPaid);
    batch.set(doc(db, "payments", payment.id), stripUndefined(payment));
    batch.update(doc(db, "loans", loan.id), {
      balanceAmount: newBalance,
      status: newBalance <= 0 ? "CLOSED" : "ACTIVE",
    });
  });
  await batch.commit();
  clearCache();
  return entries.length;
}

export async function updatePayment(payment: Payment, newAmount: number, newDate: number, newMode: PaymentMode) {
  assertPositiveAmount(newAmount, "Payment amount");
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
    weekNumber: loanWeekNumber(loan.startDate, paymentDate),
    paymentType: "DUE",
    paymentMode: "CASH",
    userId: loan.userId,
  };
  await setDoc(doc(db, "payments", payment.id), stripUndefined(payment));
  clearCache();
}

export async function renewLoan(loan: Loan, newPrincipal: number, date: number) {
  assertPositiveAmount(newPrincipal, "Renewal amount");
  if (loan.balanceAmount > 0) {
    const closure: Payment = {
      id: id(),
      loanId: loan.id,
      customerId: loan.customerId,
      amountPaid: loan.balanceAmount,
      paymentDate: date,
      weekNumber: loanWeekNumber(loan.startDate, date),
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
    .filter((p) => isRealCollectionPayment(p) && p.paymentDate >= start.getTime() && p.paymentDate <= end.getTime())
    .reduce((sum, p) => sum + p.amountPaid, 0);
}

function getWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week = Math.ceil(
    ((d.getTime() - new Date(d.getFullYear(), 0, 4).getTime()) / 86400000 + 1) / 7
  );
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

export type AllPaymentEver = {
  id: string;
  amount: number;
  date: Date;
  customerId?: string;
  loanId?: string;
  paymentType?: Payment["paymentType"];
};

export type AllLoanEver = {
  id: string;
  amount: number;
  date: Date;
  status: string;
  customerId?: string;
};

export type WeeklyChartPoint = {
  weekLabel: string;
  collected: number;
  distributed: number;
};

export const getAllPaymentsEver = async (userId?: string): Promise<AllPaymentEver[]> => {
  const [snap, loansSnap, eligibleCustomerIds] = await Promise.all([
    getDocs(userId ? query(coll.payments, where("userId", "==", userId)) : coll.payments),
    userId ? getDocs(query(coll.loans, where("userId", "==", userId))) : Promise.resolve(null),
    userId ? getEligibleCustomerIds(userId) : Promise.resolve(null),
  ]);
  const customerIdByLoanId = new Map(
    loansSnap?.docs.map((d) => {
      const loan = d.data() as Loan;
      return [loan.id, loan.customerId];
    }) ?? []
  );
  return snap.docs.map((docSnap) => {
    const d = docSnap.data() as any;
    const rawDate = d.date ?? d.payment_date ?? d.paymentDate;
    const millis = toMillis(rawDate);
    return {
      id: docSnap.id,
      amount: money(d.amountPaid ?? d.amount_paid ?? d.amount),
      date: new Date(millis || Date.now()),
      customerId: d.customerId ?? d.customer_id ?? customerIdByLoanId.get(d.loanId ?? d.loan_id),
      loanId: d.loanId ?? d.loan_id,
      paymentType: d.paymentType ?? d.type,
    };
  }).filter((payment) => !eligibleCustomerIds || (!!payment.customerId && eligibleCustomerIds.has(payment.customerId)));
};

export const getAllLoansEver = async (userId?: string): Promise<AllLoanEver[]> => {
  const [snap, eligibleCustomerIds] = await Promise.all([
    getDocs(userId ? query(coll.loans, where("userId", "==", userId)) : coll.loans),
    userId ? getEligibleCustomerIds(userId) : Promise.resolve(null),
  ]);
  const loans = snap.docs.map((docSnap) => {
    const d = docSnap.data() as any;
    const rawDate = d.start_date ?? d.startDate ?? d.createdAt;
    const millis = toMillis(rawDate);
    return {
      id: docSnap.id,
      amount: getLoanDistributedAmount(d),
      date: new Date(millis || Date.now()),
      status: d.status || "ACTIVE",
      customerId: d.customerId ?? d.customer_id,
    };
  }).filter((loan) => !eligibleCustomerIds || (!!loan.customerId && eligibleCustomerIds.has(loan.customerId)));
  const seen = new Set<string>();
  return loans.filter((loan) => {
    const key = `${loan.customerId ?? ""}:${loan.date.getTime()}:${loan.amount}:${loan.status}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const getWeeklyChartData = async (userId?: string): Promise<WeeklyChartPoint[]> => {
  // Only load data from the last 12 weeks for the chart
  const twelveWeeksAgoMs = Date.now() - 12 * 7 * 24 * 60 * 60 * 1000;

  const paymentsQuery = userId
    ? query(coll.payments, where("userId", "==", userId), where("paymentDate", ">=", twelveWeeksAgoMs))
    : query(coll.payments);
  const loansQuery = userId
    ? query(coll.loans, where("userId", "==", userId), where("startDate", ">=", twelveWeeksAgoMs))
    : query(coll.loans);
  const [eligibleCustomerIds, paymentsSnap, loansSnap] = await Promise.all([
    userId ? getEligibleCustomerIds(userId) : Promise.resolve(null),
    getDocs(paymentsQuery),
    getDocs(loansQuery),
  ]);

  // Build loan customerId lookup for payments that only have loanId
  const loansRaw = loansSnap.docs.map((docSnap) => {
    const d = docSnap.data() as any;
    const rawDate = d.start_date ?? d.startDate ?? d.createdAt;
    const millis = toMillis(rawDate);
    return {
      id: docSnap.id,
      amount: getLoanDistributedAmount(d),
      date: new Date(millis || Date.now()),
      customerId: d.customerId ?? d.customer_id,
    };
  }).filter((loan) => !eligibleCustomerIds || (!!loan.customerId && eligibleCustomerIds.has(loan.customerId)));

  const customerIdByLoanId = new Map(loansRaw.map((l) => [l.id, l.customerId]));

  const paymentsRaw = paymentsSnap.docs.map((docSnap) => {
    const d = docSnap.data() as any;
    const rawDate = d.date ?? d.payment_date ?? d.paymentDate;
    const millis = toMillis(rawDate);
    return {
      id: docSnap.id,
      amount: money(d.amountPaid ?? d.amount_paid ?? d.amount),
      date: new Date(millis || Date.now()),
      customerId: d.customerId ?? d.customer_id ?? customerIdByLoanId.get(d.loanId ?? d.loan_id),
      paymentType: d.paymentType ?? d.type,
    };
  }).filter((payment) => !eligibleCustomerIds || (!!payment.customerId && eligibleCustomerIds.has(payment.customerId)));

  const weekMap: Record<string, { collected: number; distributed: number; date: Date }> = {};

  paymentsRaw.filter(isRealCollectionPayment).forEach((payment) => {
    const key = getWeekKey(payment.date);
    if (!weekMap[key]) weekMap[key] = { collected: 0, distributed: 0, date: payment.date };
    weekMap[key].collected += payment.amount;
  });

  loansRaw.forEach((loan) => {
    const key = getWeekKey(loan.date);
    if (!weekMap[key]) weekMap[key] = { collected: 0, distributed: 0, date: loan.date };
    weekMap[key].distributed += loan.amount;
  });

  return Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => ({
      weekLabel: value.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      collected: value.collected,
      distributed: value.distributed,
    }));
};

export async function getTodayDashboardStats(userId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  const startMs = start.getTime();
  const endMs = end.getTime();

  const [paymentsSnap, loansSnap, customersSnap] = await Promise.all([
    getDocs(query(coll.payments, where("userId", "==", userId), where("paymentDate", ">=", startMs), where("paymentDate", "<=", endMs))),
    getDocs(query(coll.loans, where("userId", "==", userId), where("startDate", ">=", startMs), where("startDate", "<=", endMs))),
    getDocs(query(coll.customers, where("userId", "==", userId))),
  ]);

  const activeCustomerIds = new Set(
    customersSnap.docs
      .map((d) => d.data() as Customer)
      .filter((customer) => customer.isActive !== false)
      .map((customer) => customer.id)
  );
  const activeLoanCustomerById = new Map<string, string>();
  const todayLoans = loansSnap.docs
    .map((d) => d.data() as Loan)
    .filter((loan) => activeCustomerIds.has(loan.customerId));
  todayLoans.forEach((loan) => activeLoanCustomerById.set(loan.id, loan.customerId));

  const collectionToday = paymentsSnap.docs
    .map((d) => d.data() as Payment)
    .filter((payment) => {
      const customerId = payment.customerId ?? activeLoanCustomerById.get(payment.loanId);
      return (
        payment.paymentType !== "DUE" &&
        !!customerId &&
        activeCustomerIds.has(customerId)
      );
    })
    .reduce((sum, payment) => sum + money(payment.amountPaid), 0);

  const distributedToday = todayLoans
    .reduce((sum, loan) => sum + getLoanDistributedAmount(loan), 0);

  return { collectionToday, distributedToday };
}

export const getAllTimeTotals = async (userId?: string): Promise<{ distributed: number; collected: number }> => {
  const [payments, loans] = await Promise.all([
    getAllPaymentsEver(userId),
    getAllLoansEver(userId),
  ]);
  return {
    distributed: loans.reduce((sum, loan) => sum + loan.amount, 0),
    collected: payments.filter(isRealCollectionPayment).reduce((sum, payment) => sum + payment.amount, 0),
  };
};

export async function getPaymentsByDate(userId: string, startDate: number, endDate: number) {
  const q = query(
    coll.payments,
    where("userId", "==", userId),
    where("paymentDate", ">=", startDate),
    where("paymentDate", "<=", endDate)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Payment);
}

export async function updateCustomer(customer: Customer) {
  const sanitized = sanitizeCustomerInput(customer);
  await updateDoc(doc(db, "customers", customer.id), {
    ...stripUndefined(sanitized),
    latitude: sanitized.latitude === undefined ? deleteField() : sanitized.latitude,
    longitude: sanitized.longitude === undefined ? deleteField() : sanitized.longitude,
  });
  clearCache();
}

export async function deleteCustomer(userId: string, customerId: string) {
  const batch = writeBatch(db);

  // Delete all loans associated with this customer
  const loansQ = query(coll.loans, where("userId", "==", userId), where("customerId", "==", customerId));
  const loansSnap = await getDocs(loansQ);
  
  // We will collect loan IDs to query payments
  const loanIds = loansSnap.docs.map(doc => doc.id);

  // Delete loans
  loansSnap.docs.forEach((loanDoc) => {
    batch.delete(loanDoc.ref);
  });

  // Delete payments for these loans
  for (const loanId of loanIds) {
    const paymentsQ = query(coll.payments, where("userId", "==", userId), where("loanId", "==", loanId));
    const paymentsSnap = await getDocs(paymentsQ);
    paymentsSnap.docs.forEach((paymentDoc) => {
      batch.delete(paymentDoc.ref);
    });
  }

  // Delete any stray payments attached directly to the customer
  const strayPaymentsQ = query(coll.payments, where("userId", "==", userId), where("customerId", "==", customerId));
  const strayPaymentsSnap = await getDocs(strayPaymentsQ);
  strayPaymentsSnap.docs.forEach((paymentDoc) => {
    batch.delete(paymentDoc.ref);
  });
  
  // Finally delete the customer
  batch.delete(doc(db, "customers", customerId));

  // Commit the batch
  await batch.commit();
  clearCache();
}

export async function getCustomerByAadhar(userId: string, aadhar: string, excludeCustomerId?: string): Promise<Customer | null> {
  const normalizedAadhar = normalizeAadhar(aadhar);
  if (!normalizedAadhar) return null;

  const q = query(coll.customers, where("userId", "==", userId), limit(1500));
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

export async function blockAadhaar(aadhaar: string, reason: string, userId: string): Promise<void> {
  const normalizedAadhaar = normalizeAadhar(aadhaar);
  if (normalizedAadhaar.length !== 12) throw new Error("Aadhaar must be exactly 12 digits.");
  await addDoc(coll.blockedAadhaar, {
    aadhaarNumber: normalizedAadhaar,
    aadhaar: normalizedAadhaar,
    reason: cleanText(reason),
    blockedAt: serverTimestamp(),
    blocked_at: serverTimestamp(),
    blockedBy: userId,
    blocked_by: userId,
  });
}

export async function isAadhaarBlocked(aadhaar: string): Promise<boolean> {
  const normalizedAadhaar = normalizeAadhar(aadhaar);
  if (normalizedAadhaar.length !== 12) return false;
  const q = query(coll.blockedAadhaar, where("aadhaarNumber", "==", normalizedAadhaar), limit(1));
  const snap = await getDocs(q);
  if (!snap.empty) return true;
  const legacyQ = query(coll.blockedAadhaar, where("aadhaar", "==", normalizedAadhaar), limit(1));
  const legacySnap = await getDocs(legacyQ);
  return !legacySnap.empty;
}

export async function getBlockedAadhaars(): Promise<BlockedAadhaar[]> {
  const snap = await getDocs(query(coll.blockedAadhaar, limit(500)));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<BlockedAadhaar, "id">) }));
}

export async function unblockAadhaar(docId: string): Promise<void> {
  await deleteDoc(doc(db, "blockedAadhaar", docId));
}

export const addBlockedAadhaar = blockAadhaar;
export const checkAadhaarBlocked = isAadhaarBlocked;
export const getBlockedAadhaarList = getBlockedAadhaars;

export async function getBalancingFund(userId: string): Promise<number> {
  const snap = await getDoc(doc(db, "balancingFund", userId));
  if (snap.exists()) {
    const data = snap.data();
    return Number(data.amount || 0);
  }
  return 0;
}

export async function saveBalancingFund(userId: string, amount: number): Promise<void> {
  await setDoc(doc(db, "balancingFund", userId), {
    id: userId,
    userId,
    amount,
    updatedAt: Date.now()
  });
  clearCache();
}

export async function getBalancingFundForDate(userId: string, dateStr: string): Promise<{amount: number; exists: boolean}> {
  const snap = await getDoc(doc(db, "balancingFund", `${userId}_${dateStr}`));
  if (snap.exists()) {
    const data = snap.data();
    return { amount: Number(data.amount || 0), exists: true };
  }
  return { amount: 0, exists: false };
}

export async function saveBalancingFundForDate(userId: string, amount: number, dateStr: string): Promise<void> {
  await setDoc(doc(db, "balancingFund", `${userId}_${dateStr}`), {
    id: `${userId}_${dateStr}`,
    userId,
    amount,
    dateStr,
    updatedAt: Date.now()
  });
  clearCache();
}

export async function getAllBalancingFunds(userId: string): Promise<any[]> {
  const q = query(coll.balancingFund, where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map((docSnap) => docSnap.data());
}

export type Investment = {
  id: string;
  userId: string;
  amount: number;
  date: number;
};

export async function getInvestments(userId: string): Promise<Investment[]> {
  const q = query(coll.investments, where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map((docSnap) => docSnap.data() as Investment)
    .sort((a, b) => b.date - a.date);
}

export async function addInvestment(userId: string, amount: number, date: number): Promise<Investment> {
  assertPositiveAmount(amount, "Investment amount");
  const investment: Investment = {
    id: id(),
    userId,
    amount,
    date
  };
  await setDoc(doc(db, "investments", investment.id), stripUndefined(investment));
  clearCache();
  return investment;
}

export async function deleteInvestment(investmentId: string): Promise<void> {
  await deleteDoc(doc(db, "investments", investmentId));
  clearCache();
}

export type Expense = {
  id: string;
  userId: string;
  amount: number;
  description: string;
  date: number;
};

export async function getExpenses(userId: string): Promise<Expense[]> {
  const q = query(coll.expenses, where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map((docSnap) => docSnap.data() as Expense)
    .sort((a, b) => b.date - a.date);
}

export async function addExpense(userId: string, amount: number, description: string, date: number): Promise<Expense> {
  assertPositiveAmount(amount, "Expense amount");
  const cleanedDescription = cleanText(description);
  if (!cleanedDescription) throw new Error("Description is required.");
  const expense: Expense = {
    id: id(),
    userId,
    amount,
    description: cleanedDescription,
    date
  };
  await setDoc(doc(db, "expenses", expense.id), stripUndefined(expense));
  clearCache();
  return expense;
}

export async function deleteExpense(expenseId: string): Promise<void> {
  await deleteDoc(doc(db, "expenses", expenseId));
  clearCache();
}
