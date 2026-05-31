import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, getDocs, limit, onSnapshot, query, where, type Unsubscribe } from "firebase/firestore";
import { db } from "./firebase";
import { Customer, Loan, Payment, Village } from "./types";
import { DAY_MS as DAY, endOfMonth, getLoanDistributedAmount, getLoanPrincipalAmount, isRealCollectionPayment, money, startOfDay, startOfMonth, toMillis, weekStart } from "./business-logic";
import { filterCustomersWithVillage } from "./utils";
import type { Investment, Expense } from "./repository";

export type CustomerState = "paid" | "pending" | "overdue" | "closed";

export type MonthlyTrendPoint = {
  label: string;
  month: number; // 0-indexed month
  year: number;
  collected: number;
  distributed: number;
  invested: number;
  expenses: number;
};

export type ExpenseBreakdownItem = {
  description: string;
  amount: number;
  percentage: number;
};

export type PredictionItem = {
  label: string;         // e.g. "July 2026"
  collection: number;
  expenses: number;
  netCash: number;
  confidence: number;    // 0–100
};

export type DashboardAnalytics = {
  totals: {
    totalCollection: number;
    totalDistributed: number;
    pendingAmount: number;
    monthlyRevenue: number;
    previousMonthlyRevenue: number;
    customerCount: number;
    activeLoanCount: number;
    distributedThisMonth: number;
    distributedToday: number;
    collectionToday: number;
    dueMarksThisMonth: number;
    // NEW: investment/expense-aware fields
    totalInvestments: number;
    totalExpenses: number;
    monthlyInvestments: number;
    monthlyExpenses: number;
    previousMonthlyExpenses: number;
    netCashPosition: number;
    balancingFund: number;
    cashWalletBalance: number;
    phonePeWalletBalance: number;
    totalWalletFunds: number;
    repaidThisMonth: number;
    activeLentOut: number;
    outstandingDues: number;
  };
  weeklyTrend: {
    label: string;
    collection: number;
    distribution: number;
    dues: number;
    investments: number;
    expenses: number;
  }[];
  monthlyTrend: MonthlyTrendPoint[];
  dailyCashFlow: {
    label: string;
    date: number;
    inflow: number;
    outflow: number;
    net: number;
  }[];
  expenseBreakdown: ExpenseBreakdownItem[];
  customerHealth: {
    activeCustomers: number;
    overdueCustomers: number;
    onTimePaymentRate: number;
  };
  predictions: PredictionItem[];
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

const DASHBOARD_CACHE_PREFIX = "dashboardAnalytics:";

function changeText(current: number, previous: number, label: string) {
  if (previous <= 0 && current > 0) return `${label} started this period with Rs.${Math.round(current).toLocaleString("en-IN")} collected.`;
  if (previous <= 0) return `${label} has no prior period baseline yet.`;
  const change = ((current - previous) / previous) * 100;
  const direction = change >= 0 ? "increased" : "decreased";
  return `${label} ${direction} ${Math.abs(change).toFixed(1)}% versus the previous month.`;
}

async function getUserCollection<T>(userId: string, name: string): Promise<T[]> {
  const snap = await getDocs(query(collection(db, name), where("userId", "==", userId), limit(2000)));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as object) })) as T[];
}

// Helper to get start/end of a specific month offset (0 = current, -1 = previous, etc.)
function getMonthRange(offset: number): { start: number; end: number; label: string; month: number; year: number } {
  const now = new Date();
  const targetDate = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const start = targetDate.getTime();
  const endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59, 999);
  const end = endDate.getTime();
  const label = targetDate.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return { start, end, label, month: targetDate.getMonth(), year: targetDate.getFullYear() };
}

export async function getDashboardAnalytics(userId: string): Promise<DashboardAnalytics> {
  const cacheKey = `${DASHBOARD_CACHE_PREFIX}${userId}:${startOfDay(Date.now())}`;
  let cached: DashboardAnalytics | null = null;
  try {
    const cachedValue = await AsyncStorage.getItem(cacheKey);
    cached = cachedValue ? (JSON.parse(cachedValue) as DashboardAnalytics) : null;
  } catch {
    cached = null;
  }

  let villages: Village[];
  let customersRaw: Customer[];
  let loansRaw: Loan[];
  let paymentsRaw: Payment[];
  let investmentsRaw: Investment[];
  let expensesRaw: Expense[];
  let bfAmount = 0;
  let userProfile: any = {};

  try {
    [villages, customersRaw, loansRaw, paymentsRaw, investmentsRaw, expensesRaw] = await Promise.all([
      getUserCollection<Village>(userId, "villages"),
      getUserCollection<Customer>(userId, "customers"),
      getUserCollection<Loan>(userId, "loans"),
      getUserCollection<Payment>(userId, "payments"),
      getUserCollection<Investment>(userId, "investments"),
      getUserCollection<Expense>(userId, "expenses"),
    ]);
    // Get balancing fund
    const { getDoc, doc: docRef } = await import("firebase/firestore");
    const [bfSnap, userSnap] = await Promise.all([
      getDoc(docRef(db, "balancingFund", userId)),
      getDoc(docRef(db, "users", userId)),
    ]);
    if (bfSnap.exists()) {
      bfAmount = Number(bfSnap.data().amount || 0);
    }
    // PRIVATE — never export
    userProfile = userSnap.exists() ? userSnap.data() : {};
  } catch (error) {
    if (cached) return cached;
    throw error;
  }

  const villageById = new Map(villages.map((village) => [village.id, village]));
  const customers = filterCustomersWithVillage(customersRaw)
    .filter((customer) => customer.isActive !== false && villageById.has(customer.villageId));
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  // NOTE: UI-only filter. Customer documents in Firestore are NOT modified.
  const namedListCustomerIds = new Set(customers.map((customer) => customer.id));
  const loansNormalized = loansRaw.map((loan) => ({
    ...loan,
    startDate: toMillis(loan.startDate),
    principalAmount: getLoanPrincipalAmount(loan as any),
    distributedAmount: getLoanDistributedAmount(loan as any),
    balanceAmount: money(loan.balanceAmount),
    totalPayable: money(loan.totalPayable),
  }));
  const seenLoanKeys = new Set<string>();
  const loans = loansNormalized.filter((loan) => {
    const key = `${loan.customerId}:${loan.startDate}:${loan.principalAmount}:${loan.status}`;
    if (seenLoanKeys.has(key)) return false;
    seenLoanKeys.add(key);
    return true;
  });
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

  const regularPayments = payments.filter(isRealCollectionPayment);
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
  const distributedThisMonth = loans
    .filter((loan) => customerById.has(loan.customerId))
    .filter((loan) => loan.startDate >= monthStart && loan.startDate <= monthEnd)
    .reduce((sum, loan) => sum + loan.distributedAmount, 0);
  const distributedToday = loans
    .filter((loan) => customerById.has(loan.customerId))
    .filter((loan) => loan.startDate >= todayStart && loan.startDate <= todayEnd)
    .reduce((sum, loan) => sum + loan.distributedAmount, 0);

  // Investment & Expense calculations
  const totalInvestments = investmentsRaw.reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const totalExpenses = expensesRaw.reduce((sum, exp) => sum + (exp.amount || 0), 0);
  const monthlyInvestments = investmentsRaw
    .filter((inv) => inv.date >= monthStart && inv.date <= monthEnd)
    .reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const monthlyExpenses = expensesRaw
    .filter((exp) => exp.date >= monthStart && exp.date <= monthEnd)
    .reduce((sum, exp) => sum + (exp.amount || 0), 0);
  const previousMonthlyExpenses = expensesRaw
    .filter((exp) => exp.date >= previousMonthStart && exp.date <= previousMonthEnd)
    .reduce((sum, exp) => sum + (exp.amount || 0), 0);

  // Net cash position: BF + Investments + Collections - Distributions - Expenses
  const totalDistributed = loans
    .filter((loan) => customerById.has(loan.customerId))
    .reduce((sum, loan) => sum + loan.distributedAmount, 0);
  const netCashPosition = bfAmount + totalInvestments + totalCollection - totalDistributed - totalExpenses;
  const cashWalletBalance = Number(userProfile.cashOpeningBalance ?? 0) || 0;
  const phonePeWalletBalance = Number(userProfile.phonePeOpeningBalance ?? 0) || 0;

  // Weekly trend (8 weeks) — now with investments and expenses
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
        .reduce((sum, loan) => sum + loan.distributedAmount, 0),
      dues: payments.filter((payment) => payment.paymentType === "DUE" && payment.paymentDate >= start && payment.paymentDate <= end).length,
      investments: investmentsRaw
        .filter((inv) => inv.date >= start && inv.date <= end)
        .reduce((sum, inv) => sum + (inv.amount || 0), 0),
      expenses: expensesRaw
        .filter((exp) => exp.date >= start && exp.date <= end)
        .reduce((sum, exp) => sum + (exp.amount || 0), 0),
    };
  });

  // Monthly trend (last 6 months)
  const monthlyTrend: MonthlyTrendPoint[] = Array.from({ length: 6 }, (_, index) => {
    const { start, end, label, month, year } = getMonthRange(index - 5); // -5 to 0 = 6 months back to current
    return {
      label,
      month,
      year,
      collected: regularPayments
        .filter((p) => p.paymentDate >= start && p.paymentDate <= end)
        .reduce((sum, p) => sum + p.amountPaid, 0),
      distributed: loans
        .filter((l) => l.startDate >= start && l.startDate <= end && customerById.has(l.customerId))
        .reduce((sum, l) => sum + l.distributedAmount, 0),
      invested: investmentsRaw
        .filter((inv) => inv.date >= start && inv.date <= end)
        .reduce((sum, inv) => sum + (inv.amount || 0), 0),
      expenses: expensesRaw
        .filter((exp) => exp.date >= start && exp.date <= end)
        .reduce((sum, exp) => sum + (exp.amount || 0), 0),
    };
  });

  const dailyCashFlow = Array.from({ length: 30 }, (_, index) => {
    const start = todayStart - (29 - index) * DAY;
    const end = start + DAY - 1;
    const inflow = regularPayments
      .filter((payment) => payment.paymentDate >= start && payment.paymentDate <= end)
      .reduce((sum, payment) => sum + payment.amountPaid, 0);
    const outflow =
      loans
        .filter((loan) => loan.startDate >= start && loan.startDate <= end && customerById.has(loan.customerId))
        .reduce((sum, loan) => sum + loan.distributedAmount, 0) +
      expensesRaw
        .filter((expense) => expense.date >= start && expense.date <= end)
        .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
    return {
      label: new Date(start).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      date: start,
      inflow,
      outflow,
      net: inflow - outflow,
    };
  });

  // Expense breakdown by description/category, merged case-insensitively.
  const expenseMap = new Map<string, { description: string; amount: number }>();
  expensesRaw.forEach((exp) => {
    const desc = (exp.description || "Other").trim();
    const key = desc.toLocaleLowerCase("en-IN");
    const existing = expenseMap.get(key);
    expenseMap.set(key, {
      description: existing?.description ?? desc,
      amount: (existing?.amount ?? 0) + (Number(exp.amount) || 0),
    });
  });
  const expenseBreakdown: ExpenseBreakdownItem[] = Array.from(expenseMap.values())
    .map(({ description, amount }) => ({
      description,
      amount,
      percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  // 3-month predictions
  // Use last 3 months of data for averages
  const last3Months = monthlyTrend.slice(-3);
  const avgCollection = last3Months.length > 0
    ? last3Months.reduce((s, m) => s + m.collected, 0) / last3Months.length : 0;
  const avgDistributed = last3Months.length > 0
    ? last3Months.reduce((s, m) => s + m.distributed, 0) / last3Months.length : 0;
  const avgExpenses = last3Months.length > 0
    ? last3Months.reduce((s, m) => s + m.expenses, 0) / last3Months.length : 0;
  const avgInvested = last3Months.length > 0
    ? last3Months.reduce((s, m) => s + m.invested, 0) / last3Months.length : 0;

  // Calculate consistency (coefficient of variation) for confidence
  const collectionValues = last3Months.map((m) => m.collected);
  const collMean = avgCollection;
  const collStdDev = collectionValues.length > 1
    ? Math.sqrt(collectionValues.reduce((s, v) => s + Math.pow(v - collMean, 2), 0) / collectionValues.length)
    : 0;
  const collectionCV = collMean > 0 ? (collStdDev / collMean) : 1;
  const baseConfidence = Math.max(20, Math.min(95, Math.round(100 - collectionCV * 100)));

  const predictions: PredictionItem[] = Array.from({ length: 3 }, (_, index) => {
    const { label } = getMonthRange(index + 1); // next 3 months
    const decay = 1 - (index * 0.05); // slightly reduce confidence further out
    const projectedCollection = avgCollection * decay;
    const projectedExpenses = avgExpenses;
    const projectedNet = netCashPosition + (index + 1) * (avgCollection + avgInvested - avgDistributed - avgExpenses);
    return {
      label,
      collection: Math.round(projectedCollection),
      expenses: Math.round(projectedExpenses),
      netCash: Math.round(projectedNet),
      confidence: Math.max(15, Math.round(baseConfidence * decay)),
    };
  });

  const recentTransactions = regularPayments
    .sort((a, b) => b.paymentDate - a.paymentDate)
    .map((payment) => {
      const customer = payment.customerId ? customerById.get(payment.customerId) : undefined;
      if (!customer || !namedListCustomerIds.has(customer.id)) return null;
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
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, 8);

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
      if (!customer || !namedListCustomerIds.has(customer.id)) return null;
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
    .filter((alert): alert is NonNullable<typeof alert> => alert !== null)
    .filter((alert) => alert.balanceAmount > 0)
    .sort((a, b) => b.lastDueDate - a.lastDueDate)
    .slice(0, 8);

  const customerStates: Record<string, CustomerState> = Object.fromEntries(
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
  const overdueCustomers = Object.values(customerStates).filter((state) => state === "overdue").length;
  const openCustomers = Object.values(customerStates).filter((state) => state === "paid" || state === "pending" || state === "overdue").length;
  const onTimeCustomers = Object.values(customerStates).filter((state) => state === "paid" || state === "pending").length;
  const onTimePaymentRate = openCustomers > 0 ? Math.round((onTimeCustomers / openCustomers) * 100) : 100;

  const dueMarksThisMonth = payments.filter(
    (payment) => payment.paymentType === "DUE" && payment.paymentDate >= monthStart && payment.paymentDate <= monthEnd
  ).length;
  const currentWeekCollection = weeklyTrend[weeklyTrend.length - 1]?.collection ?? 0;
  const previousWeekCollection = weeklyTrend[weeklyTrend.length - 2]?.collection ?? 0;
  const collectionRatio = distributedThisMonth > 0 ? monthlyRevenue / distributedThisMonth : 0;
  const expenseRatio = monthlyRevenue > 0 ? (monthlyExpenses / monthlyRevenue) * 100 : 0;

  // Cash runway: months of operation at current expense rate with no new income
  const cashRunway = avgExpenses > 0 ? Math.round(netCashPosition / avgExpenses) : 999;

  const insights = [
    changeText(monthlyRevenue, previousMonthlyRevenue, "Collections"),
    dueMarksThisMonth > 0
      ? `${dueMarksThisMonth} due mark${dueMarksThisMonth === 1 ? "" : "s"} recorded this month. Prioritize high-balance follow-ups first.`
      : "No due marks this month. Collection discipline is holding steady.",
    collectionRatio > 1
      ? "Collections are ahead of this month's fresh distribution, improving cash position."
      : `Monthly recovery is at ${Math.round(collectionRatio * 100)}% of fresh distribution.`,
    // NEW expense/investment insights
    monthlyExpenses > 0
      ? `Expenses consume ${expenseRatio.toFixed(1)}% of this month's collections (Rs.${Math.round(monthlyExpenses).toLocaleString("en-IN")}).`
      : "No expenses recorded this month — great cost discipline!",
    monthlyInvestments > 0
      ? `Rs.${Math.round(monthlyInvestments).toLocaleString("en-IN")} invested this month, growing the capital base.`
      : "No new investments this month.",
  ];

  const aiInsights = [
    currentWeekCollection >= previousWeekCollection
      ? "AI insight: this week's route performance is improving; keep the same collection order and repeat the strongest shift."
      : "AI insight: this week is softer than last week; review overdue customers before approving renewals.",
    dueAlerts.length > 0
      ? `AI insight: ${dueAlerts[0].customerName} is the highest-priority reminder based on recency and outstanding balance.`
      : "AI insight: no urgent overdue pattern is visible in current active loans.",
    // NEW: cash position prediction
    cashRunway < 999
      ? `AI prediction: at current expense rate, cash runway is approximately ${cashRunway} month${cashRunway === 1 ? "" : "s"} without new income.`
      : "AI prediction: no significant recurring expenses detected; cash position is stable.",
    netCashPosition > 0
      ? `Net cash position is positive at Rs.${Math.round(netCashPosition).toLocaleString("en-IN")}. Business is solvent.`
      : `Warning: net cash position is negative (Rs.${Math.round(Math.abs(netCashPosition)).toLocaleString("en-IN")}). Consider reducing fresh distribution or increasing collections.`,
  ];

  const dashboardAnalytics: DashboardAnalytics = {
    totals: {
      totalCollection,
      totalDistributed,
      pendingAmount,
      monthlyRevenue,
      previousMonthlyRevenue,
      customerCount: customers.length,
      activeLoanCount: activeLoans.length,
      distributedThisMonth,
      distributedToday,
      collectionToday,
      dueMarksThisMonth,
      totalInvestments,
      totalExpenses,
      monthlyInvestments,
      monthlyExpenses,
      previousMonthlyExpenses,
      netCashPosition,
      balancingFund: bfAmount,
      cashWalletBalance,
      phonePeWalletBalance,
      totalWalletFunds: cashWalletBalance + phonePeWalletBalance,
      repaidThisMonth: monthlyRevenue,
      activeLentOut: pendingAmount,
      outstandingDues: dueAlerts.reduce((sum, alert) => sum + alert.dueAmount, 0),
    },
    weeklyTrend,
    monthlyTrend,
    dailyCashFlow,
    expenseBreakdown,
    customerHealth: {
      activeCustomers: customers.length,
      overdueCustomers,
      onTimePaymentRate,
    },
    predictions,
    recentTransactions,
    dueAlerts,
    customerStates,
    insights,
    aiInsights,
  };
  try {
    await AsyncStorage.setItem(cacheKey, JSON.stringify(dashboardAnalytics));
  } catch {
    // Cache failures should not block live dashboard data.
  }
  return dashboardAnalytics;
}

export function subscribeDashboardAnalytics(
  userId: string,
  onData: (analytics: DashboardAnalytics) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  let cancelled = false;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  const refresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      getDashboardAnalytics(userId)
        .then((analytics) => {
          if (!cancelled) onData(analytics);
        })
        .catch((error) => {
          if (!cancelled) onError?.(error);
        });
    }, 120);
  };

  const watch = (name: string) =>
    onSnapshot(query(collection(db, name), where("userId", "==", userId), limit(2000)), refresh, (error) => onError?.(error));

  const unsubs = [
    watch("villages"),
    watch("customers"),
    watch("loans"),
    watch("payments"),
    watch("investments"),
    watch("expenses"),
  ];
  refresh();

  return () => {
    cancelled = true;
    if (refreshTimer) clearTimeout(refreshTimer);
    unsubs.forEach((unsub) => unsub());
  };
}
