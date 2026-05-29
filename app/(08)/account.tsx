import React, { useCallback, useEffect, useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useAuth } from "../../src/auth-context";
import { useTheme } from "../../src/theme-context";
import { AnimatedScreen } from "../../src/components/AnimatedScreen";
import Icon from "../../src/Icon";
import {
  getBalancingFund,
  saveBalancingFund,
  getBalancingFundForDate,
  saveBalancingFundForDate,
  getAllBalancingFunds,
  getVillages,
  getAllActiveCustomersWithVillages,
  getInvestments,
  addInvestment,
  deleteInvestment,
  updateInvestment,
  getExpenses,
  addExpense,
  deleteExpense,
  updateExpense,
  getAllPaymentsEver,
  getAllLoansEver,
  Investment,
  Expense,
} from "../../src/repository";
import { Village } from "../../src/types";
import { openAccountStatementPrint, ExportTransaction, ExportTotals } from "../../src/exports";

import { Colors } from "../../src/theme";
import { useLanguage } from "../../src/language-context";


// Helper functions for date formatting & parsing in DD/MM/YYYY
function formatDDMMYYYY(ts: number): string {
  const d = new Date(ts);
  const day = `${d.getDate()}`.padStart(2, "0");
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function parseDDMMYYYY(str: string): number | null {
  const trimmed = str.trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }
  return date.getTime();
}

function ddmmToYyyymmdd(ddmm?: string): string {
  if (!ddmm) return "";
  const parts = ddmm.split("/");
  if (parts.length !== 3) return "";
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function yyyymmddToDdmm(yyyymmdd?: string): string {
  if (!yyyymmdd) return "";
  const parts = yyyymmdd.split("-");
  if (parts.length !== 3) return "";
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function getStartOfDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function getEndOfDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}


export default function AccountScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const { t, language } = useLanguage();
  const isTe = language === "te";



  // Selected Tab state: 'summary' | 'investments' | 'expenses'
  const [activeTab, setActiveTab] = useState<"summary" | "investments" | "expenses">("summary");

  // Loading States
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Core Data States
  const [bf, setBf] = useState<number>(0);
  const [dateSpecificBfs, setDateSpecificBfs] = useState<any[]>([]);
  const [bfDateStr, setBfDateStr] = useState<string>("");
  const [bfInput, setBfInput] = useState<string>("0");
  const [bfPreFilledStatus, setBfPreFilledStatus] = useState<"saved" | "computed" | "default">("default");
  const [lastBfDate, setLastBfDate] = useState<string>("");
  
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<any[]>([]); // Collections
  const [loans, setLoans] = useState<any[]>([]);       // Payments
  const [villages, setVillages] = useState<Village[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  // Date Range inputs (DD/MM/YYYY)
  const [startDateStr, setStartDateStr] = useState<string>("");
  const [endDateStr, setEndDateStr] = useState<string>("");

  // Forms inputs
  const [invAmount, setInvAmount] = useState<string>("");
  const [invDate, setInvDate] = useState<string>("");
  const [invName, setInvName] = useState<string>("");
  const [expAmount, setExpAmount] = useState<string>("");
  const [expDesc, setExpDesc] = useState<string>("");
  const [expDate, setExpDate] = useState<string>("");

  // Edit Expense Modal State
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editExpAmount, setEditExpAmount] = useState<string>("");
  const [editExpDesc, setEditExpDesc] = useState<string>("");
  const [editExpDate, setEditExpDate] = useState<string>("");

  // Edit Investment Modal State
  const [editingInvestment, setEditingInvestment] = useState<Investment | null>(null);
  const [editInvAmount, setEditInvAmount] = useState<string>("");
  const [editInvDate, setEditInvDate] = useState<string>("");
  const [editInvName, setEditInvName] = useState<string>("");

  // Export Modal Options State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<"pdf" | "jpg">("pdf");
  const [exportLanguage, setExportLanguage] = useState<"en" | "te">(isTe ? "te" : "en");
  const [selectedVillageId, setSelectedVillageId] = useState<"ALL" | string>("ALL");

  // Default dates on mount
  useEffect(() => {
    const today = new Date();
    const firstOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    setStartDateStr(formatDDMMYYYY(firstOfCurrentMonth.getTime()));
    setEndDateStr(formatDDMMYYYY(today.getTime()));
    
    // Set form date defaults to today
    setInvDate(formatDDMMYYYY(today.getTime()));
    setExpDate(formatDDMMYYYY(today.getTime()));
  }, []);

  // Fetch all required data from Firebase
  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [bfVal, dateBfs, invs, exps, pmts, lns, vills, custs] = await Promise.all([
        getBalancingFund(user.uid),
        getAllBalancingFunds(user.uid),
        getInvestments(user.uid),
        getExpenses(user.uid),
        getAllPaymentsEver(user.uid),
        getAllLoansEver(user.uid),
        getVillages(user.uid),
        getAllActiveCustomersWithVillages(user.uid),
      ]);
      setBf(bfVal);
      setDateSpecificBfs(dateBfs);
      setInvestments(invs);
      setExpenses(exps);
      setPayments(pmts);
      setLoans(lns);
      setVillages(vills);
      setCustomers(custs);

      // Initialize balancing fund date to today
      const todayStr = formatDDMMYYYY(Date.now());
      setBfDateStr(todayStr);
    } catch (err: any) {
      console.error(err);
      Alert.alert(t("error"), err?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  }, [user, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Dynamic input formatting for date (DD/MM/YYYY)
  const handleDateChange = useCallback((text: string, setter: (val: string) => void) => {
    let cleaned = text.replace(/[^0-9]/g, "");
    if (cleaned.length > 8) cleaned = cleaned.slice(0, 8);

    let formatted = cleaned;
    if (cleaned.length > 4) {
      formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}/${cleaned.slice(4)}`;
    } else if (cleaned.length > 2) {
      formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
    }
    setter(formatted);
  }, []);

  // Balancing Fund calculation based on dates
  const getBalancingFundForDateState = (targetDdmmStr: string) => {
    const targetYyyymmdd = ddmmToYyyymmdd(targetDdmmStr);
    if (!targetYyyymmdd) return { amount: 0, exists: false, isPreFilled: false };

    // Check if there is a saved record
    const savedRecord = dateSpecificBfs.find((item) => item.dateStr === targetYyyymmdd);
    if (savedRecord) {
      return { amount: Number(savedRecord.amount || 0), exists: true, isPreFilled: false };
    }

    // Compute from previous day's closing balance
    const targetTs = parseDDMMYYYY(targetDdmmStr);
    if (!targetTs) return { amount: 0, exists: false, isPreFilled: false };

    const prevDayTs = targetTs - 24 * 60 * 60 * 1000;
    const prevDayEnd = getEndOfDay(prevDayTs);

    // Find the latest override on or before the previous day
    const overridesBeforeOrOnPrev = dateSpecificBfs
      .filter((item) => typeof item?.dateStr === "string")
      .map((item) => ({
        ...item,
        timestamp: parseDDMMYYYY(yyyymmddToDdmm(item.dateStr)) ?? 0
      }))
      .filter((item) => item.timestamp > 0 && item.timestamp <= prevDayEnd)
      .sort((a, b) => b.timestamp - a.timestamp); // latest first

    let startBalance = bf; // fallback to global BF
    let overrideTs: number | null = null;

    if (overridesBeforeOrOnPrev.length > 0) {
      const latestOverride = overridesBeforeOrOnPrev[0];
      startBalance = latestOverride.amount;
      overrideTs = getStartOfDay(latestOverride.timestamp);
    }

    const startLimit = overrideTs !== null ? overrideTs : 0;

    // Sum transactions in [startLimit, prevDayEnd]
    const sumInvs = investments
      .filter((i) => i.date >= startLimit && i.date <= prevDayEnd)
      .reduce((sum, i) => sum + i.amount, 0);

    const sumColls = payments
      .filter((p) => {
        const ts = p.date instanceof Date ? p.date.getTime() : p.date;
        return p.paymentType === "REGULAR" && ts >= startLimit && ts <= prevDayEnd;
      })
      .reduce((sum, p) => sum + p.amount, 0);

    const sumLoans = loans
      .filter((l) => {
        const ts = l.date instanceof Date ? l.date.getTime() : l.date;
        return ts >= startLimit && ts <= prevDayEnd;
      })
      .reduce((sum, l) => sum + l.amount, 0);

    const sumExps = expenses
      .filter((e) => e.date >= startLimit && e.date <= prevDayEnd)
      .reduce((sum, e) => sum + e.amount, 0);

    const closingBalance = startBalance + sumInvs + sumColls - sumLoans - sumExps;
    return {
      amount: closingBalance,
      exists: false,
      isPreFilled: true
    };
  };

  // Reactively calculate bfInput & pre-filled status when date or dependencies change
  useEffect(() => {
    if (!bfDateStr || loading) return;
    const dateChanged = bfDateStr !== lastBfDate;
    const res = getBalancingFundForDateState(bfDateStr);
    if (dateChanged) {
      setBfInput(res.amount.toString());
      setLastBfDate(bfDateStr);
    }
    setBfPreFilledStatus(res.exists ? "saved" : (res.isPreFilled ? "computed" : "default"));
  }, [bfDateStr, dateSpecificBfs, bf, investments, expenses, payments, loans, loading]);

  // Balancing Fund Save
  const handleSaveBf = useCallback(async () => {
    if (!user) return;
    const amount = parseFloat(bfInput);
    if (isNaN(amount) || amount < 0) {
      Alert.alert(t("error"), "Please enter a valid non-negative starting balance.");
      return;
    }
    const yyyymmdd = ddmmToYyyymmdd(bfDateStr);
    if (!yyyymmdd) {
      Alert.alert(t("error"), "Please enter a valid date in DD/MM/YYYY format.");
      return;
    }
    try {
      setSubmitting(true);
      await saveBalancingFundForDate(user.uid, amount, yyyymmdd);
      // Reload lists
      const dateBfs = await getAllBalancingFunds(user.uid);
      setDateSpecificBfs(dateBfs);
      Alert.alert(t("success"), "Balancing Fund updated for " + bfDateStr);
    } catch (err: any) {
      Alert.alert(t("error"), err?.message ?? "An error occurred.");
    } finally {
      setSubmitting(false);
    }
  }, [user, bfInput, bfDateStr, t]);

  // Investment Submit
  const handleAddInvestment = useCallback(async () => {
    if (!user) return;
    const amount = parseFloat(invAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert(t("error"), "Please enter a valid investment amount.");
      return;
    }
    const timestamp = parseDDMMYYYY(invDate);
    if (!timestamp) {
      Alert.alert(t("error"), "Please enter a valid date in DD/MM/YYYY format.");
      return;
    }
    try {
      setSubmitting(true);
      await addInvestment(user.uid, amount, timestamp, invName.trim() || undefined);
      setInvAmount("");
      setInvName("");
      // Refresh list
      const invs = await getInvestments(user.uid);
      setInvestments(invs);
      Alert.alert(t("success"), "Investment entry recorded.");
    } catch (err: any) {
      Alert.alert(t("error"), err?.message ?? "An error occurred.");
    } finally {
      setSubmitting(false);
    }
  }, [user, invAmount, invDate, invName, t]);

  const handleDeleteInvestment = useCallback((id: string) => {
    Alert.alert(t("delete"), "Are you sure you want to delete this investment entry?", [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: async () => {
          try {
            setLoading(true);
            await deleteInvestment(id);
            const invs = await getInvestments(user!.uid);
            setInvestments(invs);
          } catch (err: any) {
            Alert.alert(t("error"), err.message);
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  }, [user, t]);

  // Expense Submit
  const handleAddExpense = useCallback(async () => {
    if (!user) return;
    const amount = parseFloat(expAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert(t("error"), "Please enter a valid expense amount.");
      return;
    }
    if (!expDesc.trim()) {
      Alert.alert(t("error"), "Please enter a description (e.g. Petrol, Office Supplies).");
      return;
    }
    const timestamp = parseDDMMYYYY(expDate);
    if (!timestamp) {
      Alert.alert(t("error"), "Please enter a valid date in DD/MM/YYYY format.");
      return;
    }
    try {
      setSubmitting(true);
      await addExpense(user.uid, amount, expDesc, timestamp);
      setExpAmount("");
      setExpDesc("");
      // Refresh list
      const exps = await getExpenses(user.uid);
      setExpenses(exps);
      Alert.alert(t("success"), "Expense entry recorded.");
    } catch (err: any) {
      Alert.alert(t("error"), err?.message ?? "An error occurred.");
    } finally {
      setSubmitting(false);
    }
  }, [user, expAmount, expDesc, expDate, t]);

  const handleDeleteExpense = useCallback((id: string) => {
    Alert.alert(t("delete"), "Are you sure you want to delete this expense entry?", [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: async () => {
          try {
            setLoading(true);
            await deleteExpense(id);
            const exps = await getExpenses(user!.uid);
            setExpenses(exps);
          } catch (err: any) {
            Alert.alert(t("error"), err.message);
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  }, [user, t]);

  // Edit Expense
  const handleEditExpense = useCallback((expense: Expense) => {
    setEditingExpense(expense);
    setEditExpAmount(expense.amount.toString());
    setEditExpDesc(expense.description);
    setEditExpDate(formatDDMMYYYY(expense.date));
  }, []);

  const handleUpdateExpense = useCallback(async () => {
    if (!user || !editingExpense) return;
    const amount = parseFloat(editExpAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert(t("error"), "Please enter a valid expense amount.");
      return;
    }
    if (!editExpDesc.trim()) {
      Alert.alert(t("error"), "Please enter a description.");
      return;
    }
    const timestamp = parseDDMMYYYY(editExpDate);
    if (!timestamp) {
      Alert.alert(t("error"), "Please enter a valid date in DD/MM/YYYY format.");
      return;
    }
    try {
      setSubmitting(true);
      await updateExpense(editingExpense.id, amount, editExpDesc.trim(), timestamp);
      setEditingExpense(null);
      const exps = await getExpenses(user.uid);
      setExpenses(exps);
      Alert.alert(t("success"), "Expense updated successfully.");
    } catch (err: any) {
      Alert.alert(t("error"), err?.message ?? "An error occurred.");
    } finally {
      setSubmitting(false);
    }
  }, [user, editingExpense, editExpAmount, editExpDesc, editExpDate, t]);

  // Edit Investment
  const handleEditInvestment = useCallback((investment: Investment) => {
    setEditingInvestment(investment);
    setEditInvAmount(investment.amount.toString());
    setEditInvDate(formatDDMMYYYY(investment.date));
    setEditInvName(investment.investorName || "");
  }, []);

  const handleUpdateInvestment = useCallback(async () => {
    if (!user || !editingInvestment) return;
    const amount = parseFloat(editInvAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert(t("error"), "Please enter a valid investment amount.");
      return;
    }
    const timestamp = parseDDMMYYYY(editInvDate);
    if (!timestamp) {
      Alert.alert(t("error"), "Please enter a valid date in DD/MM/YYYY format.");
      return;
    }
    try {
      setSubmitting(true);
      await updateInvestment(editingInvestment.id, amount, timestamp, editInvName.trim());
      setEditingInvestment(null);
      const invs = await getInvestments(user.uid);
      setInvestments(invs);
      Alert.alert(t("success"), "Investment updated successfully.");
    } catch (err: any) {
      Alert.alert(t("error"), err?.message ?? "An error occurred.");
    } finally {
      setSubmitting(false);
    }
  }, [user, editingInvestment, editInvAmount, editInvDate, editInvName, t]);

  // Dynamic starting balance for the selected period
  const periodBf = useMemo(() => {
    return getBalancingFundForDateState(startDateStr).amount;
  }, [startDateStr, dateSpecificBfs, bf, investments, expenses, payments, loans]);

  // Date Range Filtering and Summary Calculations
  const calculatedSummary = useMemo(() => {
    const startTs = parseDDMMYYYY(startDateStr) ?? 0;
    const endTs = parseDDMMYYYY(endDateStr) ?? Number.MAX_SAFE_INTEGER;

    // Filter Investments
    const rangeInvs = investments.filter((i) => i.date >= startTs && i.date <= endTs);
    const sumInvs = rangeInvs.reduce((sum, i) => sum + i.amount, 0);

    // Filter Collections (REGULAR customer payments)
    const rangeColls = payments.filter((p) => {
      const ts = p.date instanceof Date ? p.date.getTime() : p.date;
      return (p.paymentType === "REGULAR") && ts >= startTs && ts <= endTs;
    });
    const sumColls = rangeColls.reduce((sum, p) => sum + p.amount, 0);

    // Filter Payments (distributed loans)
    const rangeLoans = loans.filter((l) => {
      const ts = l.date instanceof Date ? l.date.getTime() : l.date;
      return ts >= startTs && ts <= endTs;
    });
    const sumLoans = rangeLoans.reduce((sum, l) => sum + l.amount, 0);

    // Filter Expenses
    const rangeExps = expenses.filter((e) => e.date >= startTs && e.date <= endTs);
    const sumExps = rangeExps.reduce((sum, e) => sum + e.amount, 0);

    // Total = periodBf + Investments + Collections - Payments - Expenses
    const netTotal = periodBf + sumInvs + sumColls - sumLoans - sumExps;

    return {
      sumInvs,
      sumColls,
      sumLoans,
      sumExps,
      netTotal,
      rangeExps,
    };
  }, [periodBf, investments, expenses, payments, loans, startDateStr, endDateStr]);

  // Monospace String Output
  const liveMonospaceBreakdown = useMemo(() => {
    const { sumInvs, sumColls, sumLoans, rangeExps, netTotal } = calculatedSummary;
    const fmt = (val: number) => Math.round(val).toLocaleString("en-IN");

    let text = "";
    text += `BF               =  ${fmt(periodBf).padStart(9)}\n`;
    if (sumInvs > 0) {
      text += `Investments      =  ${fmt(sumInvs).padStart(9)}\n`;
      text += `                 ---------\n`;
      text += `                 =  ${fmt(periodBf + sumInvs).padStart(9)}\n`;
    }
    text += `Collections      =  ${fmt(sumColls).padStart(9)}\n`;
    text += `Payments         =  ${fmt(sumLoans).padStart(9)}\n`;
    text += `                 ---------\n`;
    text += `                 =  ${fmt((sumInvs > 0 ? periodBf + sumInvs : periodBf) + sumColls - sumLoans).padStart(9)}\n`;

    if (rangeExps.length > 0) {
      rangeExps.forEach((exp) => {
        const desc = `${exp.description} (Expense)`.slice(0, 16).padEnd(16);
        text += `${desc} =  ${fmt(exp.amount).padStart(9)}\n`;
      });
      text += `                 ---------\n`;
    }

    text += `Total            =  ${fmt(netTotal).padStart(9)}`;
    return text;
  }, [periodBf, calculatedSummary]);

  // Trigger export options modal
  const handleExportPDF = useCallback(() => {
    const startTs = parseDDMMYYYY(startDateStr);
    const endTs = parseDDMMYYYY(endDateStr);
    if (!startTs || !endTs) {
      Alert.alert(t("error"), "Please make sure date range inputs are complete and valid in DD/MM/YYYY format.");
      return;
    }
    setShowExportModal(true);
  }, [startDateStr, endDateStr, t]);

  // Perform report generation on confirm
  const handleConfirmExport = async () => {
    setShowExportModal(false);

    const startTs = parseDDMMYYYY(startDateStr);
    const endTs = getEndOfDay(parseDDMMYYYY(endDateStr) ?? Date.now());
    if (!startTs || !endTs) return;

    // Build customer map
    const customerMap = new Map<string, { name: string; villageId: string; numericalId: string }>();
    customers.forEach((c) => {
      customerMap.set(c.id, { name: c.name, villageId: c.villageId, numericalId: c.numericalId });
    });

    const isAllVillages = selectedVillageId === "ALL";

    // Filter transactions
    const filteredInvs = isAllVillages
      ? investments.filter((i) => i.date >= startTs && i.date <= endTs)
      : [];

    const filteredColls = payments.filter((p) => {
      const ts = p.date instanceof Date ? p.date.getTime() : p.date;
      if (ts < startTs || ts > endTs || p.paymentType !== "REGULAR") return false;
      if (!isAllVillages) {
        const cust = customerMap.get(p.customerId);
        if (!cust || cust.villageId !== selectedVillageId) return false;
      }
      return true;
    });

    const filteredLoans = loans.filter((l) => {
      const ts = l.date instanceof Date ? l.date.getTime() : l.date;
      if (ts < startTs || ts > endTs) return false;
      if (!isAllVillages) {
        const cust = customerMap.get(l.customerId);
        if (!cust || cust.villageId !== selectedVillageId) return false;
      }
      return true;
    });

    const filteredExps = isAllVillages
      ? expenses.filter((e) => e.date >= startTs && e.date <= endTs)
      : [];

    const transList: ExportTransaction[] = [];

    filteredInvs.forEach((i) => {
      const invDesc = i.investorName
        ? `${exportLanguage === "te" ? "పెట్టుబడి" : "Investment"} (${i.investorName})`
        : (exportLanguage === "te" ? "పెట్టుబడి" : "Investment");
      transList.push({
        date: i.date,
        type: "INVESTMENT",
        desc: invDesc,
        amount: i.amount
      });
    });

    filteredColls.forEach((p) => {
      const cust = customerMap.get(p.customerId);
      const desc = cust ? `${cust.name} (${cust.numericalId})` : (exportLanguage === "te" ? "వసూలు" : "Collection");
      transList.push({
        date: p.date instanceof Date ? p.date.getTime() : p.date,
        type: "COLLECTION",
        desc,
        amount: p.amount
      });
    });

    filteredLoans.forEach((l) => {
      const cust = customerMap.get(l.customerId);
      const desc = cust ? `${cust.name} (${cust.numericalId})` : (exportLanguage === "te" ? "రుణం" : "Loan");
      transList.push({
        date: l.date instanceof Date ? l.date.getTime() : l.date,
        type: "LOAN",
        desc,
        amount: l.amount
      });
    });

    filteredExps.forEach((e) => {
      transList.push({
        date: e.date,
        type: "EXPENSE",
        desc: e.description,
        amount: e.amount
      });
    });

    // Sort chronologically
    transList.sort((a, b) => a.date - b.date);

    // Calculate totals
    const sumInvs = filteredInvs.reduce((sum, i) => sum + i.amount, 0);
    const sumColls = filteredColls.reduce((sum, p) => sum + p.amount, 0);
    const sumLoans = filteredLoans.reduce((sum, l) => sum + l.amount, 0);
    const sumExps = filteredExps.reduce((sum, e) => sum + e.amount, 0);
    const netTotal = periodBf + sumInvs + sumColls - sumLoans - sumExps;

    const totalsObj: ExportTotals = {
      sumInvs,
      sumColls,
      sumLoans,
      sumExps,
      netTotal
    };

    const targetVillageName = isAllVillages
      ? (exportLanguage === "te" ? "అన్ని గ్రామాలు" : "All Villages")
      : (villages.find((v) => v.id === selectedVillageId)?.name ?? "Village");

    const res = await openAccountStatementPrint(
      startDateStr,
      endDateStr,
      periodBf,
      transList,
      totalsObj,
      exportLanguage,
      targetVillageName,
      exportFormat,
      user?.email ?? undefined
    );

    if (res.success) {
      if (res.copied) {
        Alert.alert(t("success"), exportLanguage === "te" ? "నివేదిక క్లిప్‌బోర్డ్‌కు నకలు చేయబడింది!" : "Plain text report copied to clipboard!");
      } else {
        Alert.alert(t("success"), exportLanguage === "te" ? "నివేదిక విజయవంతంగా రూపొందించబడింది!" : "Report generated successfully!");
      }
    } else {
      Alert.alert(t("error"), "Export failed. Please check your settings.");
    }
  };

  if (!user) return null;

  return (
    <AnimatedScreen style={styles.root}>
      <LinearGradient colors={[colors.background, colors.backgroundSecondary]} style={styles.root}>
        <SafeAreaView style={styles.safe}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            
            {/* Header Hero */}
            <View style={styles.headerHero}>
              <Pressable style={styles.backBtn} onPress={() => router.back()} accessibilityLabel="Back to Dashboard">
                <Icon name="arrow-back" size={20} color={colors.white} />
              </Pressable>
              <View style={styles.heroBrand}>
                <View style={styles.heroIconBox}>
                  <Icon name="wallet-outline" size={24} color={colors.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroTitle}>{t("accountWorkspace")}</Text>
                  <Text style={styles.heroSubtitle} numberOfLines={1}>{t("accountWorkspaceDesc")}</Text>
                </View>
              </View>
            </View>

            {/* Tabs Selector */}
            <View style={styles.tabBar}>
              {(["summary", "investments", "expenses"] as const).map((tab) => {
                const active = activeTab === tab;
                const label = tab === "summary" ? t("bfSummary") : (tab === "investments" ? t("investments") : t("expenses"));
                return (
                  <Pressable
                    key={tab}
                    onPress={() => setActiveTab(tab)}
                    style={[styles.tabButton, active && { borderBottomColor: colors.white }]}
                  >
                    <Text style={[styles.tabText, active && { color: colors.white, fontWeight: "800" }]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {loading ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color={colors.white} />
                <Text style={styles.loaderText}>{t("loading")}</Text>
              </View>
            ) : (
              <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
                
                {/* TAB 1: Balancing Fund & Range Summary */}
                {activeTab === "summary" && (
                  <View style={styles.cardContainer}>
                    
                    {/* A. Balancing Fund Configuration */}
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>{t("balancingFund")}</Text>
                      <Text style={styles.cardDesc}>{t("balancingFundDesc")}</Text>
                      
                      <View style={styles.datePickerRow}>
                        <View style={[styles.inputContainer, { flex: 1.2 }]}>
                          <Text style={styles.inputLabel}>{t("date")}</Text>
                          <TextInput
                            style={styles.textInput}
                            value={bfDateStr}
                            onChangeText={(txt) => handleDateChange(txt, setBfDateStr)}
                            placeholder="DD/MM/YYYY"
                            maxLength={10}
                            keyboardType="numeric"
                            placeholderTextColor="#78909c"
                          />
                        </View>
                        <View style={[styles.inputContainer, { flex: 1.8 }]}>
                          <Text style={styles.inputLabel}>{t("startingAmount")}</Text>
                          <TextInput
                            style={styles.textInput}
                            value={bfInput}
                            onChangeText={setBfInput}
                            keyboardType="numeric"
                            placeholder="e.g. 100000"
                            placeholderTextColor="#78909c"
                          />
                        </View>
                      </View>

                      {/* Status indicator under the date selector */}
                      <View style={{ marginTop: 2, paddingHorizontal: 4 }}>
                        {bfPreFilledStatus === "saved" && (
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#0f766e" }}>
                            ✓ {isTe ? "ఈ తేదీ కొరకు భద్రపరచబడిన రికార్డు" : "Saved record for this date"}
                          </Text>
                        )}
                        {bfPreFilledStatus === "computed" && (
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#b45309" }}>
                            ℹ {isTe ? "మునుపటి ముగింపు బ్యాలెన్స్ నుండి తీసుకోబడింది" : "Pre-filled from previous day's balance"}
                          </Text>
                        )}
                        {bfPreFilledStatus === "default" && (
                          <Text style={{ fontSize: 11, fontWeight: "600", color: "#64748b" }}>
                            ℹ {isTe ? "డిఫాల్ట్ 0 గా సెట్ చేయబడింది" : "Defaulted to 0"}
                          </Text>
                        )}
                      </View>

                      <Pressable 
                        style={[styles.primaryButton, submitting && styles.btnDisabled]} 
                        onPress={handleSaveBf}
                        disabled={submitting}
                      >
                        <Text style={styles.primaryButtonText}>
                          {submitting ? t("loading") : t("updateBalancingFund")}
                        </Text>
                      </Pressable>
                    </View>

                    {/* B. Date Range Selector & Summary */}
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>{t("calculateTotals")}</Text>
                      <Text style={styles.cardDesc}>{t("calculateTotalsDesc")}</Text>

                      <View style={styles.datePickerRow}>
                        <View style={[styles.inputContainer, { flex: 1 }]}>
                          <Text style={styles.inputLabel}>{t("startDate")}</Text>
                          <TextInput
                            style={styles.textInput}
                            value={startDateStr}
                            onChangeText={(txt) => handleDateChange(txt, setStartDateStr)}
                            placeholder="DD/MM/YYYY"
                            maxLength={10}
                            keyboardType="numeric"
                            placeholderTextColor="#78909c"
                          />
                        </View>
                        <View style={[styles.inputContainer, { flex: 1 }]}>
                          <Text style={styles.inputLabel}>{t("endDate")}</Text>
                          <TextInput
                            style={styles.textInput}
                            value={endDateStr}
                            onChangeText={(txt) => handleDateChange(txt, setEndDateStr)}
                            placeholder="DD/MM/YYYY"
                            maxLength={10}
                            keyboardType="numeric"
                            placeholderTextColor="#78909c"
                          />
                        </View>
                      </View>

                      <View style={styles.breakdownHeaderRow}>
                        <Text style={styles.breakdownTitle}>{t("liveSummary")}</Text>
                        <Pressable 
                          style={styles.pdfButton} 
                          onPress={handleExportPDF}
                        >
                          <Icon name="document-text-outline" size={14} color="#111827" />
                          <Text style={styles.pdfButtonText}>{isTe ? "ఎగుమతి" : "Export"}</Text>
                        </Pressable>
                      </View>

                      <View style={styles.monospacePanel}>
                        <Text style={styles.monospaceText}>{liveMonospaceBreakdown}</Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* TAB 2: Investments */}
                {activeTab === "investments" && (
                  <View style={styles.cardContainer}>
                    
                    {/* Input card */}
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>{t("addInvestment")}</Text>
                      <Text style={styles.cardDesc}>{t("addInvestmentDesc")}</Text>

                      <View style={styles.inputContainer}>
                        <Text style={styles.inputLabel}>{t("investmentAmount")}</Text>
                        <TextInput
                          style={styles.textInput}
                          value={invAmount}
                          onChangeText={setInvAmount}
                          keyboardType="numeric"
                          placeholder="e.g. 50000"
                          placeholderTextColor="#78909c"
                        />
                      </View>

                      <View style={styles.inputContainer}>
                        <Text style={styles.inputLabel}>{t("investorName")}</Text>
                        <TextInput
                          style={styles.textInput}
                          value={invName}
                          onChangeText={setInvName}
                          placeholder={t("investorNamePlaceholder")}
                          placeholderTextColor="#78909c"
                        />
                      </View>

                      <View style={styles.inputContainer}>
                        <Text style={styles.inputLabel}>{t("date")}</Text>
                        <TextInput
                          style={styles.textInput}
                          value={invDate}
                          onChangeText={(txt) => handleDateChange(txt, setInvDate)}
                          placeholder="DD/MM/YYYY"
                          maxLength={10}
                          keyboardType="numeric"
                          placeholderTextColor="#78909c"
                        />
                      </View>

                      <Pressable 
                        style={[styles.primaryButton, submitting && styles.btnDisabled]} 
                        onPress={handleAddInvestment}
                        disabled={submitting}
                      >
                        <Text style={styles.primaryButtonText}>
                          {submitting ? t("loading") : t("addInvestmentEntry")}
                        </Text>
                      </Pressable>
                    </View>

                    {/* List investments */}
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>{t("investmentLog")}</Text>
                      
                      {investments.length === 0 ? (
                        <Text style={styles.emptyText}>{t("noInvestments")}</Text>
                      ) : (
                        investments.map((item) => (
                          <View key={item.id} style={styles.logRow}>
                             <View style={styles.logDetails}>
                              <Text style={styles.logAmount}>+ Rs. {item.amount.toLocaleString("en-IN")}</Text>
                              {item.investorName ? (
                                <Text style={styles.logDesc}>{item.investorName}</Text>
                              ) : null}
                              <Text style={styles.logDate}>{formatDDMMYYYY(item.date)}</Text>
                            </View>
                            <View style={{ flexDirection: "row", gap: 6 }}>
                              <Pressable 
                                style={[styles.deleteBtn, { backgroundColor: "#e0f2fe" }]} 
                                onPress={() => handleEditInvestment(item)}
                                accessibilityLabel="Edit entry"
                              >
                                <Icon name="create-outline" size={18} color="#0284c7" />
                              </Pressable>
                              <Pressable 
                                style={styles.deleteBtn} 
                                onPress={() => handleDeleteInvestment(item.id)}
                                accessibilityLabel="Delete entry"
                              >
                                <Icon name="trash-outline" size={18} color="#d94841" />
                              </Pressable>
                            </View>
                          </View>
                        ))
                      )}
                    </View>
                  </View>
                )}

                {/* TAB 3: Expenses */}
                {activeTab === "expenses" && (
                  <View style={styles.cardContainer}>
                    
                    {/* Input card */}
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>{t("addExpense")}</Text>
                      <Text style={styles.cardDesc}>{t("addExpenseDesc")}</Text>

                      <View style={styles.inputContainer}>
                        <Text style={styles.inputLabel}>{t("expenseAmount")}</Text>
                        <TextInput
                          style={styles.textInput}
                          value={expAmount}
                          onChangeText={setExpAmount}
                          keyboardType="numeric"
                          placeholder="e.g. 1300"
                          placeholderTextColor="#78909c"
                        />
                      </View>

                      <View style={styles.inputContainer}>
                        <Text style={styles.inputLabel}>{t("description")}</Text>
                        <TextInput
                          style={styles.textInput}
                          value={expDesc}
                          onChangeText={setExpDesc}
                          placeholder="e.g. Petrol, Office Supplies"
                          placeholderTextColor="#78909c"
                        />
                      </View>

                      <View style={styles.inputContainer}>
                        <Text style={styles.inputLabel}>{t("date")}</Text>
                        <TextInput
                          style={styles.textInput}
                          value={expDate}
                          onChangeText={(txt) => handleDateChange(txt, setExpDate)}
                          placeholder="DD/MM/YYYY"
                          maxLength={10}
                          keyboardType="numeric"
                          placeholderTextColor="#78909c"
                        />
                      </View>

                      <Pressable 
                        style={[styles.primaryButton, submitting && styles.btnDisabled]} 
                        onPress={handleAddExpense}
                        disabled={submitting}
                      >
                        <Text style={styles.primaryButtonText}>
                          {submitting ? t("loading") : t("addExpenseEntry")}
                        </Text>
                      </Pressable>
                    </View>

                    {/* List expenses */}
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>{t("expenseLog")}</Text>
                      
                      {expenses.length === 0 ? (
                        <Text style={styles.emptyText}>{t("noExpenses")}</Text>
                      ) : (
                        expenses.map((item) => (
                          <View key={item.id} style={styles.logRow}>
                            <View style={styles.logDetails}>
                              <Text style={[styles.logAmount, { color: "#d94841" }]}>
                                - Rs. {item.amount.toLocaleString("en-IN")}
                              </Text>
                              <Text style={styles.logDesc}>{item.description}</Text>
                              <Text style={styles.logDate}>{formatDDMMYYYY(item.date)}</Text>
                            </View>
                            <View style={{ flexDirection: "row", gap: 6 }}>
                              <Pressable 
                                style={[styles.deleteBtn, { backgroundColor: "#e0f2fe" }]} 
                                onPress={() => handleEditExpense(item)}
                                accessibilityLabel="Edit entry"
                              >
                                <Icon name="create-outline" size={18} color="#0284c7" />
                              </Pressable>
                              <Pressable 
                                style={styles.deleteBtn} 
                                onPress={() => handleDeleteExpense(item.id)}
                                accessibilityLabel="Delete entry"
                              >
                                <Icon name="trash-outline" size={18} color="#d94841" />
                              </Pressable>
                            </View>
                          </View>
                        ))
                      )}
                    </View>
                  </View>
                )}

              </ScrollView>
            )}

            {/* Custom Export Options Dialog Modal */}
            {showExportModal && (
              <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>{t("selectExportFormat")}</Text>
                  
                  {/* Format Choice */}
                  <Text style={styles.modalLabel}>{isTe ? "ఆకృతి (Format)" : "Export Format"}</Text>
                  <View style={styles.modalToggleRow}>
                    <Pressable
                      style={[styles.modalToggleBtn, exportFormat === "pdf" && styles.modalToggleBtnActive]}
                      onPress={() => setExportFormat("pdf")}
                    >
                      <Text style={[styles.modalToggleText, exportFormat === "pdf" && styles.modalToggleTextActive]}>
                        {t("pdfReport")}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalToggleBtn, exportFormat === "jpg" && styles.modalToggleBtnActive]}
                      onPress={() => setExportFormat("jpg")}
                    >
                      <Text style={[styles.modalToggleText, exportFormat === "jpg" && styles.modalToggleTextActive]}>
                        {t("jpgImage")}
                      </Text>
                    </Pressable>
                  </View>

                  {/* Language Choice */}
                  <Text style={styles.modalLabel}>{t("chooseLanguage")}</Text>
                  <View style={styles.modalToggleRow}>
                    <Pressable
                      style={[styles.modalToggleBtn, exportLanguage === "en" && styles.modalToggleBtnActive]}
                      onPress={() => setExportLanguage("en")}
                    >
                      <Text style={[styles.modalToggleText, exportLanguage === "en" && styles.modalToggleTextActive]}>
                        {t("english")}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalToggleBtn, exportLanguage === "te" && styles.modalToggleBtnActive]}
                      onPress={() => setExportLanguage("te")}
                    >
                      <Text style={[styles.modalToggleText, exportLanguage === "te" && styles.modalToggleTextActive]}>
                        {t("telugu")}
                      </Text>
                    </Pressable>
                  </View>

                  {/* Village Filter */}
                  <Text style={styles.modalLabel}>{t("chooseVillage")}</Text>
                  <View style={{ maxHeight: 110, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                    <ScrollView style={{ backgroundColor: "#f9fafb" }} nestedScrollEnabled={true}>
                      <Pressable
                        style={[styles.dropdownItem, selectedVillageId === "ALL" && styles.dropdownItemActive]}
                        onPress={() => setSelectedVillageId("ALL")}
                      >
                        <Text style={[styles.dropdownItemText, selectedVillageId === "ALL" && styles.dropdownItemTextActive]}>
                          {t("allVillages")}
                        </Text>
                      </Pressable>
                      {villages.map((v) => (
                        <Pressable
                          key={v.id}
                          style={[styles.dropdownItem, selectedVillageId === v.id && styles.dropdownItemActive]}
                          onPress={() => setSelectedVillageId(v.id)}
                        >
                          <Text style={[styles.dropdownItemText, selectedVillageId === v.id && styles.dropdownItemTextActive]}>
                            {v.name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>

                  {/* Actions Buttons */}
                  <View style={styles.modalActionsRow}>
                    <Pressable style={styles.modalCancelBtn} onPress={() => setShowExportModal(false)}>
                      <Text style={styles.modalCancelText}>{t("cancel")}</Text>
                    </Pressable>
                    <Pressable style={styles.modalConfirmBtn} onPress={handleConfirmExport}>
                      <Text style={styles.modalConfirmText}>{t("export")}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

            {/* Edit Expense Modal */}
            {editingExpense && (
              <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>{t("editExpense")}</Text>
                  
                  <View style={styles.inputContainer}>
                    <Text style={styles.modalLabel}>{t("expenseAmount")}</Text>
                    <TextInput
                      style={[styles.textInput, { borderColor: "#e2e8f0" }]}
                      value={editExpAmount}
                      onChangeText={setEditExpAmount}
                      keyboardType="numeric"
                      placeholder="e.g. 1300"
                      placeholderTextColor="#78909c"
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.modalLabel}>{t("description")}</Text>
                    <TextInput
                      style={[styles.textInput, { borderColor: "#e2e8f0" }]}
                      value={editExpDesc}
                      onChangeText={setEditExpDesc}
                      placeholder="e.g. Petrol"
                      placeholderTextColor="#78909c"
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.modalLabel}>{t("date")}</Text>
                    <TextInput
                      style={[styles.textInput, { borderColor: "#e2e8f0" }]}
                      value={editExpDate}
                      onChangeText={(txt) => handleDateChange(txt, setEditExpDate)}
                      placeholder="DD/MM/YYYY"
                      maxLength={10}
                      keyboardType="numeric"
                      placeholderTextColor="#78909c"
                    />
                  </View>

                  <View style={styles.modalActionsRow}>
                    <Pressable style={styles.modalCancelBtn} onPress={() => setEditingExpense(null)}>
                      <Text style={styles.modalCancelText}>{t("cancel")}</Text>
                    </Pressable>
                    <Pressable 
                      style={[styles.modalConfirmBtn, submitting && styles.btnDisabled]} 
                      onPress={handleUpdateExpense}
                      disabled={submitting}
                    >
                      <Text style={styles.modalConfirmText}>
                        {submitting ? t("loading") : t("updateExpenseEntry")}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

            {/* Edit Investment Modal */}
            {editingInvestment && (
              <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>{t("editInvestment")}</Text>
                  
                  <View style={styles.inputContainer}>
                    <Text style={styles.modalLabel}>{t("investmentAmount")}</Text>
                    <TextInput
                      style={[styles.textInput, { borderColor: "#e2e8f0" }]}
                      value={editInvAmount}
                      onChangeText={setEditInvAmount}
                      keyboardType="numeric"
                      placeholder="e.g. 50000"
                      placeholderTextColor="#78909c"
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.modalLabel}>{t("investorName")}</Text>
                    <TextInput
                      style={[styles.textInput, { borderColor: "#e2e8f0" }]}
                      value={editInvName}
                      onChangeText={setEditInvName}
                      placeholder={t("investorNamePlaceholder")}
                      placeholderTextColor="#78909c"
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.modalLabel}>{t("date")}</Text>
                    <TextInput
                      style={[styles.textInput, { borderColor: "#e2e8f0" }]}
                      value={editInvDate}
                      onChangeText={(txt) => handleDateChange(txt, setEditInvDate)}
                      placeholder="DD/MM/YYYY"
                      maxLength={10}
                      keyboardType="numeric"
                      placeholderTextColor="#78909c"
                    />
                  </View>

                  <View style={styles.modalActionsRow}>
                    <Pressable style={styles.modalCancelBtn} onPress={() => setEditingInvestment(null)}>
                      <Text style={styles.modalCancelText}>{t("cancel")}</Text>
                    </Pressable>
                    <Pressable 
                      style={[styles.modalConfirmBtn, submitting && styles.btnDisabled]} 
                      onPress={handleUpdateInvestment}
                      disabled={submitting}
                    >
                      <Text style={styles.modalConfirmText}>
                        {submitting ? t("loading") : t("updateInvestmentEntry")}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>
    </AnimatedScreen>
  );
}

const screenWidth = Dimensions.get("window").width;

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  loaderContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loaderText: { color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: "600" },
  headerHero: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  heroBrand: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  heroIconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  heroTitle: { color: "#ffffff", fontSize: 21, fontWeight: "900" },
  heroSubtitle: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: "600", marginTop: 1 },
  tabBar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.15)", paddingHorizontal: 16 },
  tabButton: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText: { color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: "700" },
  scroll: { flex: 1 },
  scrollContainer: { padding: 16, paddingBottom: 36 },
  cardContainer: { gap: 14 },
  card: { backgroundColor: "#ffffff", borderRadius: 18, padding: 16, gap: 12, shadowColor: "#111827", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 4 },
  cardTitle: { color: "#111827", fontSize: 18, fontWeight: "900" },
  cardDesc: { color: "#5f7f7b", fontSize: 12, fontWeight: "700", marginTop: -4 },
  inputContainer: { gap: 6 },
  inputLabel: { color: "#426c67", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  textInput: { backgroundColor: "#f6fffe", borderWidth: 1, borderColor: "#d8f7f4", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: "#111827" },
  primaryButton: { backgroundColor: "#ff9f1c", borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  btnDisabled: { opacity: 0.7 },
  primaryButtonText: { color: "#111827", fontSize: 15, fontWeight: "900" },
  datePickerRow: { flexDirection: "row", gap: 10 },
  breakdownHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  breakdownTitle: { color: "#111827", fontSize: 15, fontWeight: "900" },
  pdfButton: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, backgroundColor: "#cbf3f0", paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#2ec4b6" },
  pdfButtonText: { color: "#111827", fontSize: 12, fontWeight: "800" },
  monospacePanel: { backgroundColor: "#0f2725", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#174d48" },
  monospaceText: { fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace", color: "#cbf3f0", fontSize: 12, lineHeight: 18, fontWeight: "600" },
  emptyText: { color: "#5f7f7b", fontSize: 13, fontStyle: "italic", textAlign: "center", paddingVertical: 16 },
  logRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#d8f7f4" },
  logDetails: { flex: 1, gap: 2 },
  logAmount: { color: "#2ec4b6", fontSize: 15, fontWeight: "900" },
  logDesc: { color: "#111827", fontSize: 14, fontWeight: "800" },
  logDate: { color: "#5f7f7b", fontSize: 11, fontWeight: "700" },
  deleteBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#fde7e5", alignItems: "center", justifyContent: "center" },

  // Custom Export Dialog Modal Styles
  modalOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 20,
    width: screenWidth * 0.85,
    maxWidth: 360,
    gap: 12,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 4
  },
  modalLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0d9488",
    textTransform: "uppercase",
    letterSpacing: 0.05,
    marginTop: 4
  },
  modalToggleRow: {
    flexDirection: "row",
    gap: 8
  },
  modalToggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0"
  },
  modalToggleBtnActive: {
    backgroundColor: "#2ec4b6",
    borderColor: "#2ec4b6"
  },
  modalToggleText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b"
  },
  modalToggleTextActive: {
    color: "#ffffff"
  },
  dropdownItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9"
  },
  dropdownItemActive: {
    backgroundColor: "#e2fbf7"
  },
  dropdownItemText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569"
  },
  dropdownItemTextActive: {
    color: "#0d9488"
  },
  modalActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    alignItems: "center"
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569"
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#ff9f1c",
    alignItems: "center"
  },
  modalConfirmText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#111827"
  }
});

