import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { Customer, Loan, Payment, Village } from "./types";

export type CustomerState = "paid" | "pending" | "overdue" | "closed";

export type DashboardAnalytics = {
  totals: {
    totalCollection: number;
    pendingAmount: number;
    monthlyRevenue: number;
    previousMonthlyRevenue: number;
    customerCount: number;
    activeLoanCount: number;
    distributedThisMonth: number;
    distributedToday: number;
    collectionToday: number;
    dueMarksThisMonth: number;
  };
  weeklyTrend: {
    label: string;
    collection: number;
    distribution: number;
    dues: number;
  }[];
  recentTransactions: {
    id: string;
    customerId?: string;
    customerName: string;
    villageName: string;
    amountPaid: number;
    paymentDate: number;
    paymentMode: string;
    paymentType: string;
  }[];
  dueAlerts: {
    customerId: string;
    customerName: string;
    phone: string;
    villageName: string;
    balanceAmount: number;
    weeklyAmount: number;
    dueAmount: number;
    dueCount: number;
    lastDueDate: number;
  }[];
  customerStates: Record<string, CustomerState>;
  insights: string[];
  aiInsights: string[];
};

const DAY = 24 * 60 * 60 * 1000;

function toMillis(value: any) {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  return 0;
}

function money(value: any) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function netDistributedAmount(value: number) {
  const amount = money(value);
  return Math.max(0, amount - Math.floor(amount / 1000) * 20);
}

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfMonth(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfMonth(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function weekStart(ts: number) {
  const d = new Date(ts);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function changeText(current: number, previous: number, label: string) {
  if (previous <= 0 && current > 0) return `${label} started this period with Rs.${Math.round(current).toLocaleString("en-IN")} collected.`;
  if (previous <= 0) return `${label} has no prior period baseline yet.`;
  const change = ((current - previous) / previous) * 100;
  const direction = change >= 0 ? "increased" : "decreased";
  return `${label} ${direction} ${Math.abs(change).toFixed(1)}% versus the previous month.`;
}

async function getUserCollection<T>(userId: string, name: string): Promise<T[]> {
  const snap = await getDocs(query(collection(db, name), where("userId", "==", userId)));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as object) })) as T[];
}

export async function getDashboardAnalytics(userId: string): Promise<DashboardAnalytics> {
  const [villages, customersRaw, loansRaw, paymentsRaw] = await Promise.all([
    getUserCollection<Village>(userId, "villages"),
    getUserCollection<Customer>(userId, "customers"),
    getUserCollection<Loan>(userId, "loans"),
    getUserCollection<Payment>(userId, "payments"),
  ]);

  const customers = customersRaw.filter((customer) => customer.isActive !== false);
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const villageById = new Map(villages.map((village) => [village.id, village]));
  const loans = loansRaw.map((loan) => ({
    ...loan,
    startDate: toMillis(loan.startDate),
    principalAmount: money(loan.principalAmount),
    balanceAmount: money(loan.balanceAmount),
    totalPayable: money(loan.totalPayable),
  }));
  const activeLoans = loans.filter((loan) => loan.status === "ACTIVE" && customerById.has(loan.customerId));
  const activeLoanByCustomerId = new Map(activeLoans.map((loan) => [loan.customerId, loan]));
  const customerIdByLoanId = new Map(loans.map((loan) => [loan.id, loan.customerId]));
  const payments = paymentsRaw
    .map((payment) => ({
      ...payment,
      paymentDate: toMillis(payment.paymentDate),
      amountPaid: money(payment.amountPaid),
      customerId: payment.customerId ?? customerIdByLoanId.get(payment.loanId),
    }))
    .filter((payment) => !!payment.customerId && customerById.has(payment.customerId));

  const todayStart = startOfDay(Date.now());
  const todayEnd = todayStart + DAY - 1;
  const monthStart = startOfMonth();
  const monthEnd = endOfMonth();
  const previousMonthStart = startOfMonth(-1);
  const previousMonthEnd = endOfMonth(-1);

  const regularPayments = payments.filter((payment) => payment.paymentType !== "DUE");
  const totalCollection = regularPayments.reduce((sum, payment) => sum + payment.amountPaid, 0);
  const monthlyRevenue = regularPayments
    .filter((payment) => payment.paymentDate >= monthStart && payment.paymentDate <= monthEnd)
    .reduce((sum, payment) => sum + payment.amountPaid, 0);
  const previousMonthlyRevenue = regularPayments
    .filter((payment) => payment.paymentDate >= previousMonthStart && payment.paymentDate <= previousMonthEnd)
    .reduce((sum, payment) => sum + payment.amountPaid, 0);
  const collectionToday = regularPayments
    .filter((payment) => payment.paymentDate >= todayStart && payment.paymentDate <= todayEnd)
    .reduce((sum, payment) => sum + payment.amountPaid, 0);
  const pendingAmount = activeLoans.reduce((sum, loan) => sum + loan.balanceAmount, 0);
  const distributedThisMonth = activeLoans
    .filter((loan) => loan.startDate >= monthStart && loan.startDate <= monthEnd)
    .reduce((sum, loan) => sum + netDistributedAmount(loan.principalAmount), 0);
  const distributedToday = activeLoans
    .filter((loan) => loan.startDate >= todayStart && loan.startDate <= todayEnd)
    .reduce((sum, loan) => sum + netDistributedAmount(loan.principalAmount), 0);

  const currentWeekStart = weekStart(Date.now());
  const weeklyTrend = Array.from({ length: 8 }, (_, index) => {
    const start = currentWeekStart - (7 - index) * 7 * DAY;
    const end = start + 7 * DAY - 1;
    const label = new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return {
      label,
      collection: regularPayments
        .filter((payment) => payment.paymentDate >= start && payment.paymentDate <= end)
        .reduce((sum, payment) => sum + payment.amountPaid, 0),
      distribution: loans
        .filter((loan) => loan.startDate >= start && loan.startDate <= end && customerById.has(loan.customerId))
        .reduce((sum, loan) => sum + netDistributedAmount(loan.principalAmount), 0),
      dues: payments.filter((payment) => payment.paymentType === "DUE" && payment.paymentDate >= start && payment.paymentDate <= end).length,
    };
  });

  const recentTransactions = regularPayments
    .sort((a, b) => b.paymentDate - a.paymentDate)
    .slice(0, 8)
    .map((payment) => {
      const customer = payment.customerId ? customerById.get(payment.customerId) : undefined;
      const village = customer ? villageById.get(customer.villageId) : undefined;
      return {
        id: payment.id,
        customerId: payment.customerId,
        customerName: customer?.name ?? "Unknown customer",
        villageName: village?.name ?? "No village",
        amountPaid: payment.amountPaid,
        paymentDate: payment.paymentDate,
        paymentMode: payment.paymentMode,
        paymentType: payment.paymentType,
      };
    });

  const duePaymentsByCustomer = new Map<string, Payment[]>();
  payments
    .filter((payment) => payment.paymentType === "DUE" && payment.customerId)
    .forEach((payment) => {
      const list = duePaymentsByCustomer.get(payment.customerId!) ?? [];
      list.push(payment as Payment);
      duePaymentsByCustomer.set(payment.customerId!, list);
    });

  const dueAlerts = Array.from(duePaymentsByCustomer.entries())
    .map(([customerId, duePayments]) => {
      const customer = customerById.get(customerId);
      const village = customer ? villageById.get(customer.villageId) : undefined;
      const loan = activeLoanByCustomerId.get(customerId);
      const weeklyAmount = loan ? Math.min(Math.max(1, Math.round(loan.principalAmount / 10)), loan.balanceAmount) : 0;
      const dueAmount = loan ? Math.min(loan.balanceAmount, weeklyAmount * duePayments.length) : 0;
      return {
        customerId,
        customerName: customer?.name ?? "Unknown customer",
        phone: customer?.phone ?? "",
        villageName: village?.name ?? "No village",
        balanceAmount: loan?.balanceAmount ?? 0,
        weeklyAmount,
        dueAmount,
        dueCount: duePayments.length,
        lastDueDate: Math.max(...duePayments.map((payment) => toMillis(payment.paymentDate))),
      };
    })
    .filter((alert) => alert.balanceAmount > 0)
    .sort((a, b) => b.lastDueDate - a.lastDueDate)
    .slice(0, 8);

  const customerStates = Object.fromEntries(
    customers.map((customer) => {
      const loan = activeLoanByCustomerId.get(customer.id);
      const dueList = duePaymentsByCustomer.get(customer.id) ?? [];
      const hasRecentDue = dueList.some((payment) => toMillis(payment.paymentDate) >= Date.now() - 30 * DAY);
      const state: CustomerState = !loan || loan.balanceAmount <= 0 ? "closed" : hasRecentDue ? "overdue" : "pending";
      return [customer.id, state];
    })
  );
  recentTransactions.forEach((payment) => {
    if (payment.customerId && customerStates[payment.customerId] === "pending" && payment.paymentDate >= todayStart) {
      customerStates[payment.customerId] = "paid";
    }
  });

  const dueMarksThisMonth = payments.filter(
    (payment) => payment.paymentType === "DUE" && payment.paymentDate >= monthStart && payment.paymentDate <= monthEnd
  ).length;
  const currentWeekCollection = weeklyTrend[weeklyTrend.length - 1]?.collection ?? 0;
  const previousWeekCollection = weeklyTrend[weeklyTrend.length - 2]?.collection ?? 0;
  const collectionRatio = distributedThisMonth > 0 ? monthlyRevenue / distributedThisMonth : 0;

  const insights = [
    changeText(monthlyRevenue, previousMonthlyRevenue, "Collections"),
    dueMarksThisMonth > 0
      ? `${dueMarksThisMonth} due mark${dueMarksThisMonth === 1 ? "" : "s"} recorded this month. Prioritize high-balance follow-ups first.`
      : "No due marks this month. Collection discipline is holding steady.",
    collectionRatio > 1
      ? "Collections are ahead of this month's fresh distribution, improving cash position."
      : `Monthly recovery is at ${Math.round(collectionRatio * 100)}% of fresh distribution.`,
  ];

  const aiInsights = [
    currentWeekCollection >= previousWeekCollection
      ? "AI insight: this week's route performance is improving; keep the same collection order and repeat the strongest shift."
      : "AI insight: this week is softer than last week; review overdue customers before approving renewals.",
    dueAlerts.length > 0
      ? `AI insight: ${dueAlerts[0].customerName} is the highest-priority reminder based on recency and outstanding balance.`
      : "AI insight: no urgent overdue pattern is visible in current active loans.",
  ];

  return {
    totals: {
      totalCollection,
      pendingAmount,
      monthlyRevenue,
      previousMonthlyRevenue,
      customerCount: customers.length,
      activeLoanCount: activeLoans.length,
      distributedThisMonth,
      distributedToday,
      collectionToday,
      dueMarksThisMonth,
    },
    weeklyTrend,
    recentTransactions,
    dueAlerts,
    customerStates,
    insights,
    aiInsights,
  };
}
