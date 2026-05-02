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

function stripUndefined<T extends Record<string, any>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function id() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function getVillages(userId: string) {
  const q = query(coll.villages, where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Village);
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

export async function getCustomers(userId: string, villageId: string) {
  const q = query(
    coll.customers,
    where("userId", "==", userId),
    where("villageId", "==", villageId),
    where("isActive", "==", true)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Customer);
}

export async function getNextNumericalId(userId: string, dayOfWeek: string, shift: string) {
  const villages = await getVillages(userId);
  const scopedVillageIds = villages
    .filter((v) => v.dayOfWeek === dayOfWeek && v.shift === shift)
    .map((v) => v.id);
  if (scopedVillageIds.length === 0) return 1;

  const q = query(coll.customers, where("userId", "==", userId), where("isActive", "==", true));
  const snap = await getDocs(q);
  let max = 0;
  snap.docs.forEach((d) => {
    const c = d.data() as Customer;
    if (scopedVillageIds.includes(c.villageId)) max = Math.max(max, c.numericalId);
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

  const distributedToday = loansSnap.docs
    .map((d) => d.data() as Loan)
    .filter((loan) => {
      const startDate = toMillis(loan.startDate);
      return startDate >= startMs && startDate <= endMs;
    })
    .reduce((sum, loan) => sum + toAmount(loan.principalAmount), 0);

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
