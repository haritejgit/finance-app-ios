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
} from "firebase/firestore";
import { db } from "./firebase";
import { Customer, Loan, Payment, PaymentMode, PaymentType, Village } from "./types";

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
}

export async function deleteVillage(villageId: string) {
  await deleteDoc(doc(db, "villages", villageId));
}

export async function updateVillageDayShift(villageId: string, dayOfWeek: string, shift: string) {
  await updateDoc(doc(db, "villages", villageId), {
    dayOfWeek,
    shift,
  });
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

export async function getNextNumericalId(userId: string, villageId: string) {
  // Scope by specific village only - fresh serial numbers per village
  const coll = collection(db, "customers");
  const snap = await getDocs(query(coll, where("userId", "==", userId), where("villageId", "==", villageId)));
  let max = 0;
  snap.docs.forEach((d) => {
    const c = d.data() as Customer;
    max = Math.max(max, c.numericalId);
  });
  return max + 1;
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
  const numericalId = await getNextNumericalId(userId, villageId);
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

  const [paymentsSnap, loansSnap] = await Promise.all([
    getDocs(query(coll.payments, where("userId", "==", userId))),
    getDocs(query(coll.loans, where("userId", "==", userId))),
  ]);

  const collectionToday = paymentsSnap.docs
    .map((d) => d.data() as Payment)
    .filter((payment) => {
      const paymentDate = toMillis(payment.paymentDate);
      return paymentDate >= startMs && paymentDate <= endMs && payment.paymentType !== "DUE";
    })
    .reduce((sum, payment) => sum + toAmount(payment.amountPaid), 0);

  const distributedTodayRaw = loansSnap.docs
    .map((d) => d.data() as Loan)
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
}

export async function deleteCustomer(customerId: string) {
  await deleteDoc(doc(db, "customers", customerId));
}

export async function getCustomerByAadhar(userId: string, aadhar: string): Promise<Customer | null> {
  const q = query(coll.customers, where("userId", "==", userId), where("aadhar", "==", aadhar));
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0].data() as Customer;
}

export async function getCustomerLoanSummary(userId: string, aadhar: string): Promise<{customer: Customer | null, hasActiveLoan: boolean}> {
  const customer = await getCustomerByAadhar(userId, aadhar);
  if (!customer) {
    return { customer: null, hasActiveLoan: false };
  }
  
  const activeLoan = await getActiveLoan(userId, customer.id);
  return { customer, hasActiveLoan: !!activeLoan };
}
