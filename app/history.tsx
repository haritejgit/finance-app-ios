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
      <View style={styles.bodyWrapper}>
        <SafeAreaView edges={["top"]} style={styles.safe}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            {/* Header Hero */}
            <View style={styles.headerHero}>
              <Pressable style={styles.backBtn} onPress={() => router.back()} accessibilityLabel="Back to Dashboard">
                <Icon name="arrow-back" size={20} color="#D4AF6A" />
              </Pressable>
              <View style={styles.heroBrand}>
                <View style={styles.heroIconBox}>
                  <Icon name="time-outline" size={20} color="#D4AF6A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroTitle}>{t("historyLog")}</Text>
                  <Text style={styles.heroSubtitle}>
                    {isTe ? "తేదీల ఆధారంగా లావాదేవీల చరిత్రను చూడండి" : "View transaction history based on dates"}
                  </Text>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {loading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color="#12294A" />
              <Text style={styles.loaderText}>{t("loading")}</Text>
            </View>
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
              {/* Date Picker Card */}
              <View style={[styles.card, styles.dateCard]}>
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
                      placeholderTextColor="#9AA6B2"
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
                      placeholderTextColor="#9AA6B2"
                    />
                  </View>
                </View>
              </View>

              {/* Transactions List Card */}
              <View style={[styles.card, styles.txCard]}>
                {transactionsHistory.length === 0 ? (
                  <Text style={styles.emptyText}>{t("noTransactions")}</Text>
                ) : (
                  transactionsHistory.map((item, index) => {
                    let typeLabel = "";
                    let amountColor = "";
                    let amountPrefix = "";
                    let badgeBg = "";

                    switch (item.type) {
                      case "INVESTMENT":
                        typeLabel = isTe ? "పెట్టుబడి" : "INVESTMENT";
                        amountColor = "#0284c7";
                        amountPrefix = "+";
                        badgeBg = "#e0f2fe";
                        break;
                      case "COLLECTION":
                        typeLabel = isTe ? "వసూలు" : "COLLECTION";
                        amountColor = "#1E7A4C";
                        amountPrefix = "+";
                        badgeBg = "#E4F3EA";
                        break;
                      case "LOAN":
                        typeLabel = isTe ? "రుణం (పంపిణీ)" : "LOAN";
                        amountColor = "#ea580c";
                        amountPrefix = "-";
                        badgeBg = "#ffedd5";
                        break;
                      case "EXPENSE":
                        typeLabel = isTe ? "ఖర్చు" : "EXPENSE";
                        amountColor = "#d94841";
                        amountPrefix = "-";
                        badgeBg = "#fee2e2";
                        break;
                    }

                    const isLast = index === transactionsHistory.length - 1;

                    return (
                      <View key={`${item.type}-${item.id}`} style={[styles.logRow, isLast && styles.logRowLast]}>
                        <View style={styles.logDetails}>
                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                            <Text style={styles.logDesc}>{item.desc}</Text>
                            <Text style={[styles.logAmount, { color: amountColor }]}>
                              {amountPrefix} Rs. {item.amount.toLocaleString("en-IN")}
                            </Text>
                          </View>
                          
                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                            <View style={{ gap: 2 }}>
                              <Text style={styles.logDate}>{formatDateTime(item.date)}</Text>
                              {item.mode ? (
                                <Text style={styles.logMode}>Paid via {item.mode}</Text>
                              ) : null}
                            </View>
                            <View style={[styles.typeBadge, { backgroundColor: badgeBg }]}>
                              <Text style={[styles.typeBadgeText, { color: amountColor }]}>
                                {typeLabel}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </View>
    </AnimatedScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bodyWrapper: { flex: 1, backgroundColor: "#F4F6F9" },
  safe: { backgroundColor: "#12294A" },
  headerHero: { paddingHorizontal: 20, paddingVertical: 16, gap: 16, backgroundColor: "#12294A" },
  backBtn: { width: 32, height: 32, borderRadius: 9, backgroundColor: "#1E3A63", alignItems: "center", justifyContent: "center" },
  heroBrand: { flexDirection: "row", alignItems: "center", gap: 14 },
  heroIconBox: { width: 38, height: 38, borderRadius: 10, backgroundColor: "#1E3A63", alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 22, fontWeight: "700", color: "#FFFFFF" },
  heroSubtitle: { fontSize: 13, color: "#9FB2C9" },
  
  loaderContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loaderText: { fontSize: 14, color: "#12294A", fontWeight: "600" },
  
  scroll: { flex: 1 },
  scrollContainer: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16, gap: 16 },
  
  card: { backgroundColor: "#FFFFFF", borderWidth: 0.5, borderColor: "#E1E6ED", borderRadius: 12 },
  dateCard: { padding: 18 },
  txCard: { paddingHorizontal: 16, paddingVertical: 4 },
  
  datePickerRow: { flexDirection: "row", gap: 12 },
  inputContainer: { gap: 6, flex: 1 },
  inputLabel: { fontSize: 10.5, fontWeight: "600", color: "#6B7A8D", textTransform: "uppercase", letterSpacing: 0.3 },
  textInput: { height: 40, borderRadius: 8, borderWidth: 1, borderColor: "#E1E6ED", paddingHorizontal: 10, fontSize: 13, color: "#12294A", backgroundColor: "#F9FAFC" },
  
  emptyText: { textAlign: "center", paddingVertical: 40, color: "#6B7A8D", fontSize: 14, fontWeight: "600" },
  
  logRow: { paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: "#EEF1F5" },
  logRowLast: { borderBottomWidth: 0 },
  logDetails: { gap: 4 },
  logAmount: { fontSize: 16, fontWeight: "700" },
  logDesc: { fontSize: 14, fontWeight: "600", color: "#12294A" },
  logDate: { fontSize: 11.5, color: "#9AA6B2" },
  logMode: { fontSize: 11.5, color: "#9AA6B2" },
  
  typeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  typeBadgeText: { fontSize: 9.5, fontWeight: "700", textTransform: "uppercase" },
});
