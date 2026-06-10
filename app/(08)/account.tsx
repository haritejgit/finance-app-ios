import React, { useCallback, useEffect, useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useAuth } from "../../src/auth-context";
import { useTheme } from "../../src/theme-context";
import { AnimatedScreen } from "../../src/components/AnimatedScreen";
import Icon from "../../src/Icon";
import {
  getBalancingFund,
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
  getUserProfile,
  saveAccountNotes,
  saveWalletOpeningBalances,
  subscribeWalletData,
  Investment,
  Expense,
} from "../../src/repository";
import { PaymentMode, UserProfile, Village } from "../../src/types";
import { openAccountStatementPrint, ExportTransaction, ExportTotals, translateTelugu } from "../../src/exports";
import { calculateWalletBalances } from "../../src/wallet-balances";

import { useLanguage } from "../../src/language-context";


// Helper functions for date formatting & parsing in DD/MM/YYYY
function formatDDMMYYYY(ts: number): string {
  const d = new Date(ts);
  const day = `${d.getDate()}`.padStart(2, "0");
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const day = `${d.getDate()}`.padStart(2, "0");
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const year = d.getFullYear();
  const hours = `${d.getHours()}`.padStart(2, "0");
  const minutes = `${d.getMinutes()}`.padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
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

interface DatePickerFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  style?: any;
}

function DatePickerField({ value, onChange, placeholder, style }: DatePickerFieldProps) {
  const { colors } = useTheme();
  const [showPicker, setShowPicker] = useState(false);

  const dateValue = useMemo(() => {
    const parsed = parseDDMMYYYY(value);
    return parsed ? new Date(parsed) : new Date();
  }, [value]);

  const webDateValue = useMemo(() => {
    return ddmmToYyyymmdd(value);
  }, [value]);

  if (Platform.OS === "web") {
    return (
      <input
        type="date"
        value={webDateValue}
        onChange={(e) => {
          const yyyymmdd = e.target.value;
          if (yyyymmdd) {
            onChange(yyyymmddToDdmm(yyyymmdd));
          } else {
            onChange("");
          }
        }}
        style={{
          backgroundColor: colors.surfaceTint || "#f6fffe",
          borderWidth: "1px",
          borderStyle: "solid",
          borderColor: colors.border || "#d8f7f4",
          borderRadius: "12px",
          padding: "12px 14px",
          fontSize: "15px",
          color: colors.text || "#111827",
          width: "100%",
          boxSizing: "border-box",
          cursor: "pointer",
          ...(style || {}),
        }}
      />
    );
  }

  return (
    <View style={{ width: "100%" }}>
      <Pressable
        onPress={() => setShowPicker(true)}
        style={[
          {
            backgroundColor: colors.surfaceTint || "#f6fffe",
            borderWidth: 1,
            borderColor: colors.border || "#d8f7f4",
            borderRadius: 12,
            paddingVertical: 12,
            paddingHorizontal: 14,
            minHeight: 45,
            justifyContent: "center",
          },
          style,
        ]}
      >
        <Text style={{ fontSize: 15, color: value ? (colors.text || "#111827") : (colors.textMuted || "#78909c") }}>
          {value || placeholder || "DD/MM/YYYY"}
        </Text>
      </Pressable>

      {showPicker && (
        <DateTimePicker
          value={dateValue}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowPicker(false);
            if (selectedDate) {
              const day = String(selectedDate.getDate()).padStart(2, "0");
              const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
              const year = selectedDate.getFullYear();
              onChange(`${day}/${month}/${year}`);
            }
          }}
        />
      )}
    </View>
  );
}

export default function AccountScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const { t, language } = useLanguage();
  const isTe = language === "te";
  const isNarrow = Dimensions.get("window").width < 600;



  // Selected Tab state: 'summary' | 'investments' | 'expenses' | 'notes'
  const [activeTab, setActiveTab] = useState<"summary" | "investments" | "expenses" | "notes">("summary");

  // Loading States
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Core Data States
  const [bf, setBf] = useState<number>(0);
  const [dateSpecificBfs, setDateSpecificBfs] = useState<any[]>([]);
  const [bfDateStr, setBfDateStr] = useState<string>("");
  const [bfInput, setBfInput] = useState<string>("0");
  const [lastBfDate, setLastBfDate] = useState<string>("");
  
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<any[]>([]); // Collections
  const [loans, setLoans] = useState<any[]>([]);       // Payments
  const [villages, setVillages] = useState<Village[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // ─── Live wallet data (driven by onSnapshot — NEVER written by calculations) ───
  // Completely separate from the one-shot states above.
  // These drive the "Live Balance" display section only.
  const [liveExpenses, setLiveExpenses] = useState<Expense[]>([]);
  const [livePayments, setLivePayments] = useState<any[]>([]);
  const [liveLoans, setLiveLoans] = useState<any[]>([]);
  const [liveInvestments, setLiveInvestments] = useState<Investment[]>([]);
  const [liveUserProfile, setLiveUserProfile] = useState<UserProfile | null>(null);
  const [walletDataLoading, setWalletDataLoading] = useState(true);
  const [walletLoadError, setWalletLoadError] = useState<string | null>(null);

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
  const [invPaymentMode, setInvPaymentMode] = useState<PaymentMode>("CASH");
  const [expPaymentMode, setExpPaymentMode] = useState<PaymentMode>("CASH");
  const [cashOpeningInput, setCashOpeningInput] = useState<string>("0");
  const [phoneOpeningInput, setPhoneOpeningInput] = useState<string>("0");
  const [walletOpeningDateInput, setWalletOpeningDateInput] = useState<string>("");
  const [editingWallet, setEditingWallet] = useState(false);
  const [notesEditing, setNotesEditing] = useState(false);
  const [accountNotesInput, setAccountNotesInput] = useState("");
  const [notesStatus, setNotesStatus] = useState<"idle" | "saved" | "error">("idle");

  // Edit Expense Modal State
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editExpAmount, setEditExpAmount] = useState<string>("");
  const [editExpDesc, setEditExpDesc] = useState<string>("");
  const [editExpDate, setEditExpDate] = useState<string>("");
  const [editExpPaymentMode, setEditExpPaymentMode] = useState<PaymentMode>("CASH");

  // Edit Investment Modal State
  const [editingInvestment, setEditingInvestment] = useState<Investment | null>(null);
  const [editInvAmount, setEditInvAmount] = useState<string>("");
  const [editInvDate, setEditInvDate] = useState<string>("");
  const [editInvName, setEditInvName] = useState<string>("");
  const [editInvPaymentMode, setEditInvPaymentMode] = useState<PaymentMode>("CASH");

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

  // Fetch Balancing Fund + villages + customers + export-related data (one-shot).
  // NOTE: Wallet data (expenses, payments, loans, investments, userProfile) is now
  // handled by the subscribeWalletData() real-time listener below.
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

  // ─── Real-time wallet data subscription ────────────────────────────────────
  // Sets up onSnapshot listeners for expenses, payments, loans, investments, and
  // user profile. The callback receives fresh data and updates ONLY the
  // live* display state — it NEVER calls setCashOpeningInput or setPhoneOpeningInput
  // after the initial mount (which seeds the manual input fields from Firestore).
  useEffect(() => {
    if (!user) return;
    setWalletDataLoading(true);
    setWalletLoadError(null);

    let isFirstCallback = true;

    const unsubscribe = subscribeWalletData(
      user.uid,
      (data) => {
        // ONLY update live display state — these drive Section B (Live Balance)
        setLiveExpenses(data.expenses);
        setLivePayments(data.payments);
        setLiveLoans(data.loans);
        setLiveInvestments(data.investments);
        setLiveUserProfile(data.userProfile);

        if (isFirstCallback) {
          isFirstCallback = false;
          setWalletDataLoading(false);
          // Seed manual snapshot input fields from saved Firestore values (ONE TIME ONLY)
          // PRIVATE — never export
          setCashOpeningInput(String(data.userProfile.cashOpeningBalance ?? 0));
          setPhoneOpeningInput(String(data.userProfile.phonePeOpeningBalance ?? 0));
          setWalletOpeningDateInput(
            data.userProfile.walletOpeningDate
              ? formatDDMMYYYY(data.userProfile.walletOpeningDate as number)
              : formatDDMMYYYY(Date.now())
          );
          setEditingWallet(!data.userProfile.walletOpeningDate);
          // Also seed the legacy userProfile for export/notes features
          setUserProfile(data.userProfile);
          setAccountNotesInput(data.userProfile.accountNotes ?? "");
        } else {
          // Subsequent live updates: refresh display profile ONLY, not manual fields
          setUserProfile(data.userProfile);
        }
      },
      (err) => {
        console.error("Wallet data subscription error:", err);
        setWalletLoadError("Could not load balance. Tap to retry.");
        setWalletDataLoading(false);
      }
    );

    // Cleanup: unsubscribe all 5 listeners when component unmounts or user changes
    return () => {
      unsubscribe();
    };
  }, [user]);


  // Balancing Fund calculation based on dates
  const getBalancingFundForDateState = useCallback((targetDdmmStr: string) => {
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
  }, [bf, dateSpecificBfs, expenses, investments, loans, payments]);

  // Reactively calculate bfInput & pre-filled status when date or dependencies change
  useEffect(() => {
    if (!bfDateStr || loading) return;
    const dateChanged = bfDateStr !== lastBfDate;
    const res = getBalancingFundForDateState(bfDateStr);
    if (dateChanged) {
      setBfInput(res.amount.toString());
      setLastBfDate(bfDateStr);
    }
  }, [bfDateStr, getBalancingFundForDateState, lastBfDate, loading]);

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
      await addInvestment(user.uid, amount, timestamp, invName.trim() || undefined, invPaymentMode);
      setInvAmount("");
      setInvName("");
      setInvPaymentMode("CASH");
      // Refresh list
      const invs = await getInvestments(user.uid);
      setInvestments(invs);
      Alert.alert(t("success"), "Investment entry recorded.");
    } catch (err: any) {
      Alert.alert(t("error"), err?.message ?? "An error occurred.");
    } finally {
      setSubmitting(false);
    }
  }, [user, invAmount, invDate, invName, invPaymentMode, t]);

  const handleDeleteInvestment = useCallback((id: string) => {
    const doDelete = async () => {
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
    };

    if (Platform.OS === "web") {
      const confirm = window.confirm("Are you sure you want to delete this investment entry?");
      if (confirm) {
        doDelete();
      }
    } else {
      Alert.alert(t("delete"), "Are you sure you want to delete this investment entry?", [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("delete"),
          style: "destructive",
          onPress: doDelete,
        },
      ]);
    }
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
      await addExpense(user.uid, amount, expDesc, timestamp, expPaymentMode);
      setExpAmount("");
      setExpDesc("");
      setExpPaymentMode("CASH");
      // Refresh list
      const exps = await getExpenses(user.uid);
      setExpenses(exps);
      Alert.alert(t("success"), "Expense entry recorded.");
    } catch (err: any) {
      Alert.alert(t("error"), err?.message ?? "An error occurred.");
    } finally {
      setSubmitting(false);
    }
  }, [user, expAmount, expDesc, expDate, expPaymentMode, t]);

  const handleDeleteExpense = useCallback((id: string) => {
    const doDelete = async () => {
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
    };

    if (Platform.OS === "web") {
      const confirm = window.confirm("Are you sure you want to delete this expense entry?");
      if (confirm) {
        doDelete();
      }
    } else {
      Alert.alert(t("delete"), "Are you sure you want to delete this expense entry?", [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("delete"),
          style: "destructive",
          onPress: doDelete,
        },
      ]);
    }
  }, [user, t]);

  // Edit Expense
  const handleEditExpense = useCallback((expense: Expense) => {
    setEditingExpense(expense);
    setEditExpAmount(expense.amount.toString());
    setEditExpDesc(expense.description);
    setEditExpDate(formatDDMMYYYY(expense.date));
    setEditExpPaymentMode(expense.payment_mode === "PHONE" ? "PHONE" : "CASH");
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
      await updateExpense(editingExpense.id, amount, editExpDesc.trim(), timestamp, editExpPaymentMode);
      setEditingExpense(null);
      const exps = await getExpenses(user.uid);
      setExpenses(exps);
      Alert.alert(t("success"), "Expense updated successfully.");
    } catch (err: any) {
      Alert.alert(t("error"), err?.message ?? "An error occurred.");
    } finally {
      setSubmitting(false);
    }
  }, [user, editingExpense, editExpAmount, editExpDesc, editExpDate, editExpPaymentMode, t]);

  // Edit Investment
  const handleEditInvestment = useCallback((investment: Investment) => {
    setEditingInvestment(investment);
    setEditInvAmount(investment.amount.toString());
    setEditInvDate(formatDDMMYYYY(investment.date));
    setEditInvName(investment.investorName || "");
    setEditInvPaymentMode(investment.payment_mode === "PHONE" ? "PHONE" : "CASH");
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
      await updateInvestment(editingInvestment.id, amount, timestamp, editInvName.trim(), editInvPaymentMode);
      setEditingInvestment(null);
      const invs = await getInvestments(user.uid);
      setInvestments(invs);
      Alert.alert(t("success"), "Investment updated successfully.");
    } catch (err: any) {
      Alert.alert(t("error"), err?.message ?? "An error occurred.");
    } finally {
      setSubmitting(false);
    }
  }, [user, editingInvestment, editInvAmount, editInvDate, editInvName, editInvPaymentMode, t]);

  // Dynamic starting balance for the selected period
  const periodBf = useMemo(() => {
    return getBalancingFundForDateState(startDateStr).amount;
  }, [startDateStr, getBalancingFundForDateState]);

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
    const expenseTotals = Array.from(
      rangeExps.reduce((map, expense) => {
        const label = (expense.description || "Other").trim() || "Other";
        const key = label.toLocaleLowerCase("en-IN");
        const existing = map.get(key);
        map.set(key, {
          description: existing?.description ?? label,
          amount: (existing?.amount ?? 0) + (Number(expense.amount) || 0),
        });
        return map;
      }, new Map<string, { description: string; amount: number }>())
    )
      .map(([, value]) => value)
      .sort((a, b) => b.amount - a.amount);

    // Total = periodBf + Investments + Collections - Payments - Expenses
    const netTotal = periodBf + sumInvs + sumColls - sumLoans - sumExps;

    return {
      sumInvs,
      sumColls,
      sumLoans,
      sumExps,
      netTotal,
      rangeExps,
      expenseTotals,
    };
  }, [periodBf, investments, expenses, payments, loans, startDateStr, endDateStr]);

  const transactionsHistory = useMemo(() => {
    const startTs = parseDDMMYYYY(startDateStr) ?? 0;
    const endTs = getEndOfDay(parseDDMMYYYY(endDateStr) ?? Date.now());

    // Build customer map
    const customerMap = new Map<string, { name: string; numericalId: string }>();
    customers.forEach((c) => {
      customerMap.set(c.id, { name: c.name, numericalId: c.numericalId });
    });

    const list: Array<{
      id: string;
      date: number;
      type: "INVESTMENT" | "COLLECTION" | "LOAN" | "EXPENSE";
      amount: number;
      desc: string;
      mode?: string;
    }> = [];

    // Filter Investments
    investments
      .filter((i) => i.date >= startTs && i.date <= endTs)
      .forEach((i) => {
        list.push({
          id: i.id,
          date: i.date,
          type: "INVESTMENT",
          amount: i.amount,
          desc: i.investorName
            ? `${isTe ? "పెట్టుబడి" : "Investment"} (${i.investorName})`
            : (isTe ? "పెట్టుబడి" : "Investment"),
          mode: i.payment_mode === "PHONE" ? "PhonePe" : "Cash",
        });
      });

    // Filter Collections (REGULAR payments)
    payments
      .filter((p) => {
        const ts = p.date instanceof Date ? p.date.getTime() : p.date;
        return p.paymentType === "REGULAR" && ts >= startTs && ts <= endTs;
      })
      .forEach((p) => {
        const ts = p.date instanceof Date ? p.date.getTime() : p.date;
        const cust = customerMap.get(p.customerId);
        const desc = cust
          ? `${cust.name} (${cust.numericalId})`
          : (isTe ? "వసూళ్లు" : "Collection");
        list.push({
          id: p.id,
          date: ts,
          type: "COLLECTION",
          amount: p.amount,
          desc,
          mode: p.paymentMode === "PHONE" ? "PhonePe" : "Cash",
        });
      });

    // Filter Loans (disbursed loans)
    loans
      .filter((l) => {
        const ts = l.date instanceof Date ? l.date.getTime() : l.date;
        return ts >= startTs && ts <= endTs;
      })
      .forEach((l) => {
        const ts = l.date instanceof Date ? l.date.getTime() : l.date;
        const cust = customerMap.get(l.customerId);
        const desc = cust
          ? `${cust.name} (${cust.numericalId})`
          : (isTe ? "పంచిన డబ్బులు" : "Loan");
        list.push({
          id: l.id,
          date: ts,
          type: "LOAN",
          amount: l.amount,
          desc,
          mode: l.paymentMode === "PHONE" ? "PhonePe" : "Cash",
        });
      });

    // Filter Expenses
    expenses
      .filter((e) => e.date >= startTs && e.date <= endTs)
      .forEach((e) => {
        list.push({
          id: e.id,
          date: e.date,
          type: "EXPENSE",
          amount: e.amount,
          desc: e.description || (isTe ? "ఖర్చు" : "Expense"),
          mode: e.payment_mode === "PHONE" ? "PhonePe" : "Cash",
        });
      });

    // Sort chronologically descending
    return list.sort((a, b) => b.date - a.date);
  }, [investments, payments, loans, expenses, startDateStr, endDateStr, customers, isTe]);



  // ─── Live Calculated Wallet Balance (DISPLAY ONLY) ───────────────────────
  // Derived from real-time onSnapshot data. NEVER writes back to Firestore
  // or to cashOpeningInput / phoneOpeningInput.
  //
  // Formula:
  //   calculatedCash = snapshot.cash
  //     + SUM(cash collections received after snapshot.setAt)
  //     - SUM(cash expenses after snapshot.setAt)
  //     - SUM(cash amounts invested/lent after snapshot.setAt)
  //
  //   calculatedPhonePe = snapshot.phonepe
  //     + SUM(phonepe collections received after snapshot.setAt)
  //     - SUM(phonepe expenses after snapshot.setAt)
  //
  // The walletOpeningDate in liveUserProfile acts as snapshot.setAt.
  const walletBalances = useMemo(() => {
    if (!liveUserProfile) return null;
    // calculateWalletBalances is a pure read-only function — no side effects
    return calculateWalletBalances(
      liveUserProfile,
      liveLoans as any[],
      livePayments as any[],
      liveExpenses,
      liveInvestments
    );
  }, [liveExpenses, liveInvestments, liveLoans, livePayments, liveUserProfile]);

  const handleSaveWalletBalances = useCallback(async () => {
    if (!user) return;
    const cashOpening = Number(cashOpeningInput);
    const phoneOpening = Number(phoneOpeningInput);
    const openingDate = parseDDMMYYYY(walletOpeningDateInput);
    if (!Number.isFinite(cashOpening) || !Number.isFinite(phoneOpening) || !openingDate) {
      Alert.alert(t("error"), "Enter valid Cash, PhonePe, and balance date values.");
      return;
    }
    try {
      setSubmitting(true);
      await saveWalletOpeningBalances(user.uid, cashOpening, phoneOpening, openingDate);
      const profile = await getUserProfile(user.uid);
      setUserProfile(profile);
      setEditingWallet(false);
      Alert.alert(t("success"), "Wallet balances saved.");
    } catch (err: any) {
      Alert.alert(t("error"), err?.message ?? "Could not save wallet balances.");
    } finally {
      setSubmitting(false);
    }
  }, [cashOpeningInput, phoneOpeningInput, walletOpeningDateInput, t, user]);

  const handleSaveNotes = useCallback(async () => {
    if (!user) return;
    try {
      setNotesStatus("idle");
      await new Promise((resolve) => setTimeout(resolve, 300));
      // PRIVATE â€” never export
      await saveAccountNotes(user.uid, accountNotesInput);
      setUserProfile((current) => ({ ...(current ?? { id: user.uid, userId: user.uid }), accountNotes: accountNotesInput }));
      setNotesEditing(false);
      setNotesStatus("saved");
      setTimeout(() => setNotesStatus("idle"), 2000);
    } catch {
      setNotesStatus("error");
    }
  }, [accountNotesInput, user]);

  // Monospace String Output
  const liveMonospaceBreakdown = useMemo(() => {
    const { sumInvs, sumColls, sumLoans, expenseTotals, netTotal } = calculatedSummary;
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

    if (expenseTotals.length > 0) {
      expenseTotals.forEach((exp) => {
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
      const name = i.investorName ? (exportLanguage === "te" ? translateTelugu(i.investorName) : i.investorName) : "";
      const invDesc = name
        ? `${exportLanguage === "te" ? "పెట్టుబడి" : "Investment"} (${name})`
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
      const name = cust ? (exportLanguage === "te" ? translateTelugu(cust.name) : cust.name) : "";
      const desc = cust ? `${name} (${cust.numericalId})` : (exportLanguage === "te" ? "వసూళ్లు" : "Collection");
      transList.push({
        date: p.date instanceof Date ? p.date.getTime() : p.date,
        type: "COLLECTION",
        desc,
        amount: p.amount
      });
    });

    filteredLoans.forEach((l) => {
      const cust = customerMap.get(l.customerId);
      const name = cust ? (exportLanguage === "te" ? translateTelugu(cust.name) : cust.name) : "";
      const desc = cust ? `${name} (${cust.numericalId})` : (exportLanguage === "te" ? "పంచిన డబ్బులు" : "Loan");
      transList.push({
        date: l.date instanceof Date ? l.date.getTime() : l.date,
        type: "LOAN",
        desc,
        amount: l.amount
      });
    });

    filteredExps.forEach((e) => {
      const desc = exportLanguage === "te" ? translateTelugu(e.description) : e.description;
      transList.push({
        date: e.date,
        type: "EXPENSE",
        desc,
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
      ? (exportLanguage === "te" ? "à°…à°¨à±à°¨à°¿ à°—à±à°°à°¾à°®à°¾à°²à±" : "All Villages")
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
        Alert.alert(t("success"), exportLanguage === "te" ? "à°¨à°¿à°µà±‡à°¦à°¿à°• à°•à±à°²à°¿à°ªà±â€Œà°¬à±‹à°°à±à°¡à±â€Œà°•à± à°¨à°•à°²à± à°šà±‡à°¯à°¬à°¡à°¿à°‚à°¦à°¿!" : "Plain text report copied to clipboard!");
      } else {
        Alert.alert(t("success"), exportLanguage === "te" ? "à°¨à°¿à°µà±‡à°¦à°¿à°• à°µà°¿à°œà°¯à°µà°‚à°¤à°‚à°—à°¾ à°°à±‚à°ªà±Šà°‚à°¦à°¿à°‚à°šà°¬à°¡à°¿à°‚à°¦à°¿!" : "Report generated successfully!");
      }
    } else {
      Alert.alert(t("error"), "Export failed. Please check your settings.");
    }
  };

  const renderCalculateCard = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("calculateTotals")}</Text>
      <Text style={styles.cardDesc}>{t("calculateTotalsDesc")}</Text>

      <View style={isNarrow ? { flexDirection: "column", gap: 12 } : styles.datePickerRow}>
        <View style={isNarrow ? styles.inputContainer : [styles.inputContainer, { flex: 1 }]}>
          <Text style={styles.inputLabel}>{t("startDate")}</Text>
          <DatePickerField
            value={startDateStr}
            onChange={setStartDateStr}
            placeholder="DD/MM/YYYY"
          />
        </View>
        <View style={isNarrow ? styles.inputContainer : [styles.inputContainer, { flex: 1 }]}>
          <Text style={styles.inputLabel}>{t("endDate")}</Text>
          <DatePickerField
            value={endDateStr}
            onChange={setEndDateStr}
            placeholder="DD/MM/YYYY"
          />
        </View>
      </View>

      <View style={styles.breakdownHeaderRow}>
        <Text style={styles.breakdownTitle}>{t("liveSummary")}</Text>
        <Pressable style={styles.pdfButton} onPress={handleExportPDF}>
          <Icon name="document-text-outline" size={14} color="#111827" />
          <Text style={styles.pdfButtonText}>{isTe ? "à°Žà°—à±à°®à°¤à°¿" : "Export"}</Text>
        </Pressable>
      </View>

      <View style={styles.monospacePanel}>
        <Text style={styles.monospaceText}>{liveMonospaceBreakdown}</Text>
      </View>
    </View>
  );

  const renderBlockAadhaarCard = () => (
    <Pressable style={[styles.card, styles.blockAadhaarCard]} onPress={() => router.push("/block-aadhaar" as any)}>
      <View style={styles.blockAadhaarHeader}>
        <View style={styles.blockAadhaarIcon}>
          <Icon name="shield-checkmark-outline" size={20} color="#C62828" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Block Aadhaar</Text>
          <Text style={styles.cardDesc}>Prevent blocked Aadhaar numbers from new registrations</Text>
        </View>
        <Icon name="arrow-forward" size={20} color="#C62828" />
      </View>
    </Pressable>
  );

  const renderNotesCard = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>My Notes</Text>
      <Text style={styles.cardDesc}>Write anything - for your eyes only</Text>
      {notesEditing || !(userProfile?.accountNotes || "").trim() ? (
        <>
          <TextInput
            style={[styles.textInput, styles.notesInput]}
            value={accountNotesInput}
            onChangeText={setAccountNotesInput}
            placeholder="Write notes about accounts, customers, reminders..."
            placeholderTextColor="#78909c"
            multiline
            numberOfLines={4}
          />
          {notesStatus === "error" ? <Text style={styles.notesError}>Save failed - try again</Text> : null}
          <Pressable style={styles.primaryButton} onPress={handleSaveNotes}>
            <Text style={styles.primaryButtonText}>{notesStatus === "saved" ? "Saved ✓" : "Save"}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.notesReadOnly}>{userProfile?.accountNotes}</Text>
          <Pressable style={styles.smallEditBtn} onPress={() => setNotesEditing(true)}>
            <Text style={styles.smallEditText}>Edit</Text>
          </Pressable>
        </>
      )}
    </View>
  );

  const renderHistoryCard = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("historyLog")}</Text>
      <Text style={styles.cardDesc}>
        {isTe ? "తేదీల ఆధారంగా లావాదేవీల చరిత్రను చూడండి" : "View transaction history based on dates"}
      </Text>

      <View style={isNarrow ? { flexDirection: "column", gap: 12 } : styles.datePickerRow}>
        <View style={isNarrow ? styles.inputContainer : [styles.inputContainer, { flex: 1 }]}>
          <Text style={styles.inputLabel}>{t("startDate")}</Text>
          <DatePickerField
            value={startDateStr}
            onChange={setStartDateStr}
            placeholder="DD/MM/YYYY"
          />
        </View>
        <View style={isNarrow ? styles.inputContainer : [styles.inputContainer, { flex: 1 }]}>
          <Text style={styles.inputLabel}>{t("endDate")}</Text>
          <DatePickerField
            value={endDateStr}
            onChange={setEndDateStr}
            placeholder="DD/MM/YYYY"
          />
        </View>
      </View>

      <View style={styles.walletDivider} />

      {transactionsHistory.length === 0 ? (
        <Text style={styles.emptyText}>{t("noTransactions")}</Text>
      ) : (
        transactionsHistory.map((item) => {
          let typeLabel = "";
          let amountColor = "";
          let amountPrefix = "";

          switch (item.type) {
            case "INVESTMENT":
              typeLabel = isTe ? "పెట్టుబడి" : "Investment";
              amountColor = "#0284c7";
              amountPrefix = "+";
              break;
            case "COLLECTION":
              typeLabel = isTe ? "వసూలు" : "Collection";
              amountColor = "#16803a";
              amountPrefix = "+";
              break;
            case "LOAN":
              typeLabel = isTe ? "రుణం (పంపిణీ)" : "Loan (Disbursed)";
              amountColor = "#ea580c";
              amountPrefix = "-";
              break;
            case "EXPENSE":
              typeLabel = isTe ? "ఖర్చు" : "Expense";
              amountColor = "#d94841";
              amountPrefix = "-";
              break;
          }

          return (
            <View key={`${item.type}-${item.id}`} style={styles.logRow}>
              <View style={styles.logDetails}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[styles.logAmount, { color: amountColor }]}>
                    {amountPrefix} Rs. {item.amount.toLocaleString("en-IN")}
                  </Text>
                  <View style={{ backgroundColor: amountColor + "15", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                    <Text style={{ fontSize: 9, fontWeight: "800", color: amountColor, textTransform: "uppercase" }}>
                      {typeLabel}
                    </Text>
                  </View>
                </View>
                <Text style={styles.logDesc}>{item.desc}</Text>
                <Text style={styles.logDate}>{formatDateTime(item.date)}</Text>
                {item.mode ? (
                  <Text style={styles.logDate}>Paid via {item.mode}</Text>
                ) : null}
              </View>
            </View>
          );
        })
      )}
    </View>
  );



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
            <View style={styles.tabBarContainer}>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                contentContainerStyle={styles.tabBar}
              >
                {(["summary", "investments", "expenses", "notes"] as const).map((tab) => {
                  const active = activeTab === tab;
                  const label = tab === "summary"
                    ? t("bfSummary")
                    : (tab === "investments"
                        ? t("investments")
                        : (tab === "expenses"
                            ? t("expenses")
                            : "Notes"
                          )
                      );
                  return (
                    <Pressable
                      key={tab}
                      onPress={() => setActiveTab(tab)}
                      style={[styles.tabButton, active && { borderBottomColor: colors.white }]}
                    >
                      <Text 
                        numberOfLines={1}
                        style={[styles.tabText, active && { color: colors.white, fontWeight: "800" }]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
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
                    {renderCalculateCard()}
                    {renderBlockAadhaarCard()}
                    
                    {/* A. Balancing Fund Configuration */}
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>{t("balancingFund")}</Text>
                      <Text style={styles.cardDesc}>{t("balancingFundDesc")}</Text>
                      
                      <View style={isNarrow ? { flexDirection: "column", gap: 12 } : styles.datePickerRow}>
                        <View style={isNarrow ? styles.inputContainer : [styles.inputContainer, { flex: 1.2 }]}>
                          <Text style={styles.inputLabel}>{t("date")}</Text>
                          <DatePickerField
                            value={bfDateStr}
                            onChange={setBfDateStr}
                            placeholder="DD/MM/YYYY"
                          />
                        </View>
                        <View style={isNarrow ? styles.inputContainer : [styles.inputContainer, { flex: 1.8 }]}>
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

                    {/* ═══════════════════════════════════════════════════════════
                        MY WALLET BALANCES CARD
                        Section A: Manual Snapshot Entry (user-controlled, independent fields)
                        Section B: Live Calculated Balance (read-only display)
                        These two sections are COMPLETELY INDEPENDENT.
                    ═══════════════════════════════════════════════════════════ */}
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>My Wallet Balances</Text>

                      {/* ── SECTION A: Wallet Snapshot (Manual Entry) ── */}
                      <View style={styles.walletSectionHeader}>
                        <View style={[styles.walletSectionBadge, { backgroundColor: "#e3f2fd" }]}>
                          <Text style={[styles.walletSectionBadgeText, { color: "#1565C0" }]}>A</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.walletSectionTitle}>Wallet Snapshot</Text>
                          <Text style={styles.walletSectionDesc}>Enter your current physical balances</Text>
                        </View>
                      </View>

                      {walletDataLoading ? (
                        <View style={styles.walletLoadingRow}>
                          <ActivityIndicator size="small" color="#2ec4b6" />
                          <Text style={styles.walletLoadingText}>Loading wallet data…</Text>
                        </View>
                      ) : walletLoadError ? (
                        <Pressable style={styles.walletErrorRow} onPress={() => {
                          setWalletDataLoading(true);
                          setWalletLoadError(null);
                        }}>
                          <Icon name="alert-circle-outline" size={16} color="#C62828" />
                          <Text style={styles.walletErrorText}>{walletLoadError}</Text>
                        </Pressable>
                      ) : !liveUserProfile?.walletOpeningDate && !editingWallet ? (
                        <Pressable style={styles.walletEmptyPrompt} onPress={() => setEditingWallet(true)}>
                          <Icon name="wallet-outline" size={20} color="#5f7f7b" />
                          <Text style={styles.walletEmptyText}>Set your starting balance to begin tracking</Text>
                        </Pressable>
                      ) : !editingWallet ? (
                        <View style={styles.walletSavedRow}>
                          <Text style={styles.walletSavedText}>
                            Cash: Rs.{Math.round(liveUserProfile?.cashOpeningBalance ?? 0).toLocaleString("en-IN")}{"  "}|
                            {" "}PhonePe: Rs.{Math.round(liveUserProfile?.phonePeOpeningBalance ?? 0).toLocaleString("en-IN")}
                          </Text>
                          <Text style={styles.walletSavedDate}>
                            Last updated: {liveUserProfile?.walletOpeningDate
                              ? formatDDMMYYYY(liveUserProfile.walletOpeningDate as number)
                              : "—"}
                          </Text>
                          <Pressable style={styles.smallEditBtn} onPress={() => setEditingWallet(true)}>
                            <Text style={styles.smallEditText}>Edit</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <>
                          <View style={isNarrow ? { flexDirection: "column", gap: 12 } : styles.datePickerRow}>
                            {/* Cash field — ONLY updates cashOpeningInput, independent */}
                            <View style={isNarrow ? styles.inputContainer : [styles.inputContainer, { flex: 1 }]}>
                              <Text style={styles.inputLabel}>Cash in Hand (Rs.)</Text>
                              <TextInput
                                style={styles.textInput}
                                value={cashOpeningInput}
                                onChangeText={setCashOpeningInput}
                                keyboardType="numeric"
                                placeholder="0"
                                placeholderTextColor="#78909c"
                              />
                            </View>
                            {/* PhonePe field — ONLY updates phoneOpeningInput, independent */}
                            <View style={isNarrow ? styles.inputContainer : [styles.inputContainer, { flex: 1 }]}>
                              <Text style={styles.inputLabel}>PhonePe Balance (Rs.)</Text>
                              <TextInput
                                style={styles.textInput}
                                value={phoneOpeningInput}
                                onChangeText={setPhoneOpeningInput}
                                keyboardType="numeric"
                                placeholder="0"
                                placeholderTextColor="#78909c"
                              />
                            </View>
                          </View>
                          <View style={styles.inputContainer}>
                            <Text style={styles.inputLabel}>Balances as of</Text>
                            <DatePickerField
                              value={walletOpeningDateInput}
                              onChange={setWalletOpeningDateInput}
                              placeholder="DD/MM/YYYY"
                            />
                          </View>
                          <Pressable
                            style={[styles.primaryButton, submitting && styles.btnDisabled]}
                            onPress={handleSaveWalletBalances}
                            disabled={submitting}
                          >
                            <Text style={styles.primaryButtonText}>Save Wallet Snapshot</Text>
                          </Pressable>
                        </>
                      )}

                      {/* ── SECTION B: Live Calculated Balance (Read-Only) ── */}
                      <View style={styles.walletDivider} />
                      <View style={styles.walletSectionHeader}>
                        <View style={[styles.walletSectionBadge, { backgroundColor: "#e8f5e9" }]}>
                          <Text style={[styles.walletSectionBadgeText, { color: "#2E7D32" }]}>B</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.walletSectionTitle}>Live Balance</Text>
                          <Text style={styles.walletSectionDesc}>Calculated from all your activity</Text>
                        </View>
                        <View style={styles.walletLiveDot} />
                      </View>

                      {walletDataLoading ? (
                        <View style={styles.walletLoadingRow}>
                          <ActivityIndicator size="small" color="#2ec4b6" />
                          <Text style={styles.walletLoadingText}>Calculating…</Text>
                        </View>
                      ) : !walletBalances ? (
                        <Text style={styles.walletEmptyText}>Save a starting snapshot above to see live balance</Text>
                      ) : (
                        <>
                          <View style={styles.totalFundsCard}>
                            <Text style={styles.totalFundsLabel}>Total Available (Cash + PhonePe)</Text>
                            <Text style={[styles.totalFundsValue, { color: walletBalances.totalAvailable >= 0 ? "#2E7D32" : "#C62828" }]}>
                              Rs.{Math.round(walletBalances.totalAvailable).toLocaleString("en-IN")}
                            </Text>
                            <Text style={styles.walletCardSub}>Auto-updated from your transactions</Text>
                          </View>
                          <View style={styles.walletCardsRow}>
                            {([
                              ["Cash", walletBalances.cash, "#1565C0"] as const,
                              ["PhonePe", walletBalances.phonePe, "#5F259F"] as const,
                            ]).map(([label, wallet, tone]) => (
                              <View key={label} style={styles.walletCard}>
                                <Text style={[styles.walletCardTitle, { color: tone }]}>{label}</Text>
                                <Text style={[styles.walletCardValue, { color: wallet.current >= 0 ? "#2E7D32" : "#C62828" }]}>
                                  Rs.{Math.round(wallet.current).toLocaleString("en-IN")}
                                </Text>
                                <Text style={styles.walletCardSub}>Since {formatDDMMYYYY(walletBalances.openingDate)}</Text>
                                <Text style={styles.walletBreakdown}>
                                  Opening: Rs.{Math.round(wallet.opening).toLocaleString("en-IN")}
                                  {"\n"}+ Collected: +Rs.{Math.round(wallet.collected).toLocaleString("en-IN")}
                                  {"\n"}- Lent out: -Rs.{Math.round(wallet.disbursed).toLocaleString("en-IN")}
                                  {"\n"}- Expenses: -Rs.{Math.round(wallet.expenses).toLocaleString("en-IN")}
                                  {label === "Cash" ? `\n+ Invested: +Rs.${Math.round(wallet.investments).toLocaleString("en-IN")}` : ""}
                                </Text>
                              </View>
                            ))}
                          </View>
                          <Text style={styles.walletAutoNote}>🔄 Auto-updated from your transactions</Text>
                        </>
                      )}
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
                        <Text style={styles.inputLabel}>Paid via</Text>
                        <View style={styles.paymentModeRow}>
                          {(["CASH", "PHONE"] as const).map((paymentMode) => (
                            <Pressable
                              key={paymentMode}
                              style={[
                                styles.paymentModeBtn,
                                invPaymentMode === paymentMode && { backgroundColor: paymentMode === "PHONE" ? "#5F259F" : "#1565C0", borderColor: paymentMode === "PHONE" ? "#5F259F" : "#1565C0" },
                              ]}
                              onPress={() => setInvPaymentMode(paymentMode)}
                            >
                              <Text style={[styles.paymentModeText, invPaymentMode === paymentMode && styles.paymentModeTextOn]}>
                                {paymentMode === "PHONE" ? "PhonePe" : "Cash"}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
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
                        <DatePickerField
                          value={invDate}
                          onChange={setInvDate}
                          placeholder="DD/MM/YYYY"
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
                              <Text style={styles.logDate}>Paid via {item.payment_mode === "PHONE" ? "PhonePe" : "Cash"}</Text>
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
                        <Text style={styles.inputLabel}>Paid via</Text>
                        <View style={styles.paymentModeRow}>
                          {(["CASH", "PHONE"] as const).map((paymentMode) => (
                            <Pressable
                              key={paymentMode}
                              style={[
                                styles.paymentModeBtn,
                                expPaymentMode === paymentMode && { backgroundColor: paymentMode === "PHONE" ? "#5F259F" : "#1565C0", borderColor: paymentMode === "PHONE" ? "#5F259F" : "#1565C0" },
                              ]}
                              onPress={() => setExpPaymentMode(paymentMode)}
                            >
                              <Text style={[styles.paymentModeText, expPaymentMode === paymentMode && styles.paymentModeTextOn]}>
                                {paymentMode === "PHONE" ? "PhonePe" : "Cash"}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
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
                        <DatePickerField
                          value={expDate}
                          onChange={setExpDate}
                          placeholder="DD/MM/YYYY"
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
                              <Text style={styles.logDate}>Paid via {item.payment_mode === "PHONE" ? "PhonePe" : "Cash"}</Text>
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





                {activeTab === "notes" && (
                  <View style={styles.cardContainer}>
                    {renderNotesCard()}
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
                  <Text style={styles.modalLabel}>{isTe ? "à°†à°•à±ƒà°¤à°¿ (Format)" : "Export Format"}</Text>
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
                    <Text style={styles.modalLabel}>Paid via</Text>
                    <View style={styles.paymentModeRow}>
                      {(["CASH", "PHONE"] as const).map((paymentMode) => (
                        <Pressable
                          key={paymentMode}
                          style={[
                            styles.paymentModeBtn,
                            editExpPaymentMode === paymentMode && { backgroundColor: paymentMode === "PHONE" ? "#5F259F" : "#1565C0", borderColor: paymentMode === "PHONE" ? "#5F259F" : "#1565C0" },
                          ]}
                          onPress={() => setEditExpPaymentMode(paymentMode)}
                        >
                          <Text style={[styles.paymentModeText, editExpPaymentMode === paymentMode && styles.paymentModeTextOn]}>
                            {paymentMode === "PHONE" ? "PhonePe" : "Cash"}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
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
                    <DatePickerField
                      value={editExpDate}
                      onChange={setEditExpDate}
                      placeholder="DD/MM/YYYY"
                      style={{ borderColor: "#e2e8f0" }}
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
                    <Text style={styles.modalLabel}>Paid via</Text>
                    <View style={styles.paymentModeRow}>
                      {(["CASH", "PHONE"] as const).map((paymentMode) => (
                        <Pressable
                          key={paymentMode}
                          style={[
                            styles.paymentModeBtn,
                            editInvPaymentMode === paymentMode && { backgroundColor: paymentMode === "PHONE" ? "#5F259F" : "#1565C0", borderColor: paymentMode === "PHONE" ? "#5F259F" : "#1565C0" },
                          ]}
                          onPress={() => setEditInvPaymentMode(paymentMode)}
                        >
                          <Text style={[styles.paymentModeText, editInvPaymentMode === paymentMode && styles.paymentModeTextOn]}>
                            {paymentMode === "PHONE" ? "PhonePe" : "Cash"}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
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
                    <DatePickerField
                      value={editInvDate}
                      onChange={setEditInvDate}
                      placeholder="DD/MM/YYYY"
                      style={{ borderColor: "#e2e8f0" }}
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
  tabBarContainer: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.15)" },
  tabBar: { flexDirection: "row", paddingHorizontal: 12 },
  tabButton: { 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    alignItems: "center", 
    borderBottomWidth: 2, 
    borderBottomColor: "transparent",
    flexShrink: 0
  },
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
  notesInput: { minHeight: 108, maxHeight: 300, textAlignVertical: "top" },
  notesReadOnly: { color: "#111827", fontSize: 14, lineHeight: 21, fontWeight: "600", backgroundColor: "#f6fffe", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#d8f7f4" },
  notesError: { color: "#C62828", fontSize: 12, fontWeight: "800" },
  smallEditBtn: { alignSelf: "flex-start", borderRadius: 999, backgroundColor: "#E3F2FD", borderWidth: 1, borderColor: "#1565C0", paddingHorizontal: 12, paddingVertical: 7 },
  smallEditText: { color: "#1565C0", fontSize: 12, fontWeight: "900" },
  walletSavedRow: { gap: 8 },
  walletSavedText: { color: "#111827", fontSize: 13, fontWeight: "800", lineHeight: 19 },
  totalFundsCard: { borderRadius: 14, backgroundColor: "#F5F9FF", borderWidth: 1, borderColor: "#dbeafe", padding: 14, gap: 4 },
  totalFundsLabel: { color: "#546E7A", fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  totalFundsValue: { fontSize: 24, fontWeight: "900" },
  walletCardsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  walletCard: { flex: 1, minWidth: 150, borderRadius: 14, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#dbeafe", padding: 12, gap: 5 },
  walletCardTitle: { fontSize: 13, fontWeight: "900" },
  walletCardValue: { fontSize: 20, fontWeight: "900" },
  walletCardSub: { color: "#546E7A", fontSize: 11, fontWeight: "800" },
  walletBreakdown: { color: "#546E7A", fontSize: 10, lineHeight: 15, fontWeight: "700" },
  // Wallet section styles — two-section A/B layout
  walletSectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  walletSectionBadge: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  walletSectionBadgeText: { fontSize: 13, fontWeight: "900" },
  walletSectionTitle: { color: "#111827", fontSize: 14, fontWeight: "900" },
  walletSectionDesc: { color: "#5f7f7b", fontSize: 11, fontWeight: "700" },
  walletDivider: { height: 1, backgroundColor: "#d8f7f4", marginVertical: 8 },
  walletLiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#2ec4b6" },
  walletLoadingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
  walletLoadingText: { color: "#5f7f7b", fontSize: 13, fontWeight: "700" },
  walletErrorRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff7f7", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#fecaca" },
  walletErrorText: { color: "#C62828", fontSize: 13, fontWeight: "800", flex: 1 },
  walletEmptyPrompt: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#f0fffe", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#d8f7f4" },
  walletEmptyText: { color: "#5f7f7b", fontSize: 13, fontWeight: "700", flex: 1 },
  walletSavedDate: { color: "#5f7f7b", fontSize: 11, fontWeight: "700" },
  walletAutoNote: { color: "#5f7f7b", fontSize: 11, fontWeight: "700", textAlign: "center", marginTop: 4 },
  blockAadhaarCard: { borderColor: "#fecaca", backgroundColor: "#fff7f7" },
  blockAadhaarHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  blockAadhaarIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#fee2e2" },
  paymentModeRow: { flexDirection: "row", gap: 8 },
  paymentModeBtn: { flex: 1, borderRadius: 999, backgroundColor: "#F5F9FF", borderWidth: 1, borderColor: "#d2d8e1", paddingVertical: 10, alignItems: "center" },
  paymentModeText: { color: "#64748b", fontSize: 13, fontWeight: "900" },
  paymentModeTextOn: { color: "#ffffff" },
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
