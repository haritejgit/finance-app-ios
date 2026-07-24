import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useAuth } from "../src/auth-context";
import { AnimatedScreen } from "../src/components/AnimatedScreen";
import Icon from "../src/Icon";
import { useTheme } from "../src/theme-context";
import { useLanguage } from "../src/language-context";
import {
  getInvestments,
  getExpenses,
  getAllPaymentsEver,
  getAllLoansEver,
  getAllActiveCustomersWithVillages,
} from "../src/repository";

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

function getEndOfDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

export default function HistoryScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const isTe = language === "te";

  const [loading, setLoading] = useState(true);

  // Raw data lists
  const [payments, setPayments] = useState<any[]>([]); // Collections
  const [loans, setLoans] = useState<any[]>([]);       // Disbursals
  const [investments, setInvestments] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  // Date Range inputs (DD/MM/YYYY)
  const [startDateStr, setStartDateStr] = useState<string>("");
  const [endDateStr, setEndDateStr] = useState<string>("");

  // Default dates on mount
  useEffect(() => {
    const today = new Date();
    const firstOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    setStartDateStr(formatDDMMYYYY(firstOfCurrentMonth.getTime()));
    setEndDateStr(formatDDMMYYYY(today.getTime()));
  }, []);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [invs, exps, pmts, lns, custs] = await Promise.all([
        getInvestments(user.uid),
        getExpenses(user.uid),
        getAllPaymentsEver(user.uid),
        getAllLoansEver(user.uid),
        getAllActiveCustomersWithVillages(user.uid),
      ]);
      setInvestments(invs);
      setExpenses(exps);
      setPayments(pmts);
      setLoans(lns);
      setCustomers(custs);
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

    // Filter Loans (disbursed loans & renewals)
    loans.forEach((l) => {
      const ts = Number(l.startDate ?? l.createdAt ?? (l.date instanceof Date ? l.date.getTime() : l.date) ?? 0);
      if (!ts || ts < startTs || ts > endTs) return;

      const cust = customerMap.get(l.customerId);
      const custLabel = cust ? `${cust.name} (#${cust.numericalId})` : (isTe ? "ఖాతాదారు" : "Customer");
      const isRenewal = l.status === "RENEWED" || (l.notes && l.notes.includes("renew"));
      const principal = Number(l.principalAmount ?? l.amount ?? 0);

      list.push({
        id: `loan_${l.id}`,
        date: ts,
        type: "LOAN",
        amount: principal,
        desc: isRenewal
          ? (isTe ? `🔄 నవీకరణ (మళ్లీ ఇచ్చిన అప్పు) - ${custLabel}` : `🔄 Loan Renewed - ${custLabel}`)
          : (isTe ? `🆕 కొత్త అప్పు - ${custLabel}` : `🆕 New Loan Given - ${custLabel}`),
        mode: (l.disbursement_mode ?? l.disbursementMode ?? l.paymentMode) === "PHONE" ? "PhonePe" : "Cash",
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
          desc: isTe ? "ఖర్చు" : e.description,
          mode: e.payment_mode === "PHONE" ? "PhonePe" : "Cash",
        });
      });

    // Sort chronologically descending
    return list.sort((a, b) => b.date - a.date);
  }, [investments, expenses, payments, loans, customers, startDateStr, endDateStr, isTe]);

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
                  <Icon name="time-outline" size={24} color={colors.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroTitle}>{t("historyLog")}</Text>
                  <Text style={styles.heroSubtitle}>
                    {isTe ? "తేదీల ఆధారంగా లావాదేవీల చరిత్రను చూడండి" : "View transaction history based on dates"}
                  </Text>
                </View>
              </View>
            </View>

            {loading ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color={colors.white} />
                <Text style={styles.loaderText}>{t("loading")}</Text>
              </View>
            ) : (
              <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
                <View style={styles.card}>
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
              </ScrollView>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>
    </AnimatedScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  headerHero: { paddingHorizontal: 20, paddingVertical: 24, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(255, 255, 255, 0.15)", alignItems: "center", justifyContent: "center" },
  heroBrand: { flexDirection: "row", alignItems: "center", gap: 14 },
  heroIconBox: { width: 48, height: 48, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 24, fontWeight: "900", color: "#FFFFFF" },
  heroSubtitle: { fontSize: 13, color: "rgba(255,255,255,0.76)" },
  loaderContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loaderText: { fontSize: 14, color: "rgba(255,255,255,0.75)", fontWeight: "600" },
  scroll: { flex: 1 },
  scrollContainer: { paddingHorizontal: 16, paddingBottom: 40 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  datePickerRow: { flexDirection: "row", gap: 12 },
  inputContainer: { gap: 6, flex: 1 },
  inputLabel: { fontSize: 11, fontWeight: "800", color: "#546e7a", textTransform: "uppercase" },
  textInput: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: "#cfd8dc", paddingHorizontal: 12, fontSize: 15, color: "#1a252c", backgroundColor: "#fafafa" },
  walletDivider: { height: 1, backgroundColor: "#eceff1", marginVertical: 16 },
  emptyText: { textAlign: "center", paddingVertical: 40, color: "#78909c", fontSize: 14, fontWeight: "600" },
  logRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#eceff1" },
  logDetails: { gap: 4 },
  logAmount: { fontSize: 16, fontWeight: "900" },
  logDesc: { fontSize: 14, fontWeight: "700", color: "#1a252c" },
  logDate: { fontSize: 11, fontWeight: "600", color: "#78909c" },
});
