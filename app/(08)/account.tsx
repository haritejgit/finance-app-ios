import React, { useEffect, useState, useMemo } from "react";
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
  getInvestments,
  addInvestment,
  deleteInvestment,
  getExpenses,
  addExpense,
  deleteExpense,
  getAllPaymentsEver,
  getAllLoansEver,
  Investment,
  Expense,
} from "../../src/repository";
import { openAccountStatementPrint } from "../../src/exports";
import { Colors } from "../../src/theme";

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

export default function AccountScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();

  // Selected Tab state: 'summary' | 'investments' | 'expenses'
  const [activeTab, setActiveTab] = useState<"summary" | "investments" | "expenses">("summary");

  // Loading States
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Core Data States
  const [bf, setBf] = useState<number>(0);
  const [bfInput, setBfInput] = useState<string>("0");
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<any[]>([]); // Collections
  const [loans, setLoans] = useState<any[]>([]);       // Payments

  // Date Range inputs (DD/MM/YYYY)
  const [startDateStr, setStartDateStr] = useState<string>("");
  const [endDateStr, setEndDateStr] = useState<string>("");

  // Forms inputs
  const [invAmount, setInvAmount] = useState<string>("");
  const [invDate, setInvDate] = useState<string>("");
  const [expAmount, setExpAmount] = useState<string>("");
  const [expDesc, setExpDesc] = useState<string>("");
  const [expDate, setExpDate] = useState<string>("");

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
  const loadData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [bfVal, invs, exps, pmts, lns] = await Promise.all([
        getBalancingFund(user.uid),
        getInvestments(user.uid),
        getExpenses(user.uid),
        getAllPaymentsEver(user.uid),
        getAllLoansEver(user.uid),
      ]);
      setBf(bfVal);
      setBfInput(bfVal.toString());
      setInvestments(invs);
      setExpenses(exps);
      setPayments(pmts);
      setLoans(lns);
    } catch (err: any) {
      console.error(err);
      Alert.alert("Error Loading Account Data", err?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  // Dynamic input formatting for date (DD/MM/YYYY)
  const handleDateChange = (text: string, setter: (val: string) => void) => {
    let cleaned = text.replace(/[^0-9]/g, "");
    if (cleaned.length > 8) cleaned = cleaned.slice(0, 8);

    let formatted = cleaned;
    if (cleaned.length > 4) {
      formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}/${cleaned.slice(4)}`;
    } else if (cleaned.length > 2) {
      formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
    }
    setter(formatted);
  };

  // Balancing Fund Save
  const handleSaveBf = async () => {
    if (!user) return;
    const amount = parseFloat(bfInput);
    if (isNaN(amount) || amount < 0) {
      Alert.alert("Invalid Amount", "Please enter a valid non-negative starting balance.");
      return;
    }
    try {
      setSubmitting(true);
      await saveBalancingFund(user.uid, amount);
      setBf(amount);
      Alert.alert("Success", "Balancing Fund starting balance updated successfully!");
    } catch (err: any) {
      Alert.alert("Save Failed", err?.message ?? "An error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  // Investment Submit
  const handleAddInvestment = async () => {
    if (!user) return;
    const amount = parseFloat(invAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid investment amount.");
      return;
    }
    const timestamp = parseDDMMYYYY(invDate);
    if (!timestamp) {
      Alert.alert("Invalid Date", "Please enter a valid date in DD/MM/YYYY format.");
      return;
    }
    try {
      setSubmitting(true);
      await addInvestment(user.uid, amount, timestamp);
      setInvAmount("");
      // Refresh list
      const invs = await getInvestments(user.uid);
      setInvestments(invs);
      Alert.alert("Success", "Investment entry recorded.");
    } catch (err: any) {
      Alert.alert("Add Failed", err?.message ?? "An error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteInvestment = (id: string) => {
    Alert.alert("Delete Investment", "Are you sure you want to delete this investment entry?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setLoading(true);
            await deleteInvestment(id);
            const invs = await getInvestments(user!.uid);
            setInvestments(invs);
          } catch (err: any) {
            Alert.alert("Error deleting", err.message);
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  // Expense Submit
  const handleAddExpense = async () => {
    if (!user) return;
    const amount = parseFloat(expAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid expense amount.");
      return;
    }
    if (!expDesc.trim()) {
      Alert.alert("Description Required", "Please enter a description (e.g. Petrol, Office Supplies).");
      return;
    }
    const timestamp = parseDDMMYYYY(expDate);
    if (!timestamp) {
      Alert.alert("Invalid Date", "Please enter a valid date in DD/MM/YYYY format.");
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
      Alert.alert("Success", "Expense entry recorded.");
    } catch (err: any) {
      Alert.alert("Add Failed", err?.message ?? "An error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteExpense = (id: string) => {
    Alert.alert("Delete Expense", "Are you sure you want to delete this expense entry?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setLoading(true);
            await deleteExpense(id);
            const exps = await getExpenses(user!.uid);
            setExpenses(exps);
          } catch (err: any) {
            Alert.alert("Error deleting", err.message);
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

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

    // Total = BF + Investments + Collections - Payments - Expenses
    const netTotal = bf + sumInvs + sumColls - sumLoans - sumExps;

    return {
      sumInvs,
      sumColls,
      sumLoans,
      sumExps,
      netTotal,
      rangeExps,
    };
  }, [bf, investments, expenses, payments, loans, startDateStr, endDateStr]);

  // Monospace String Output
  const liveMonospaceBreakdown = useMemo(() => {
    const { sumInvs, sumColls, sumLoans, rangeExps, netTotal } = calculatedSummary;
    const fmt = (val: number) => Math.round(val).toLocaleString("en-IN");

    let text = "";
    text += `BF               =  ${fmt(bf).padStart(9)}\n`;
    text += `Investments      =  ${fmt(sumInvs).padStart(9)}\n`;
    text += `                 ---------\n`;
    text += `                 =  ${fmt(bf + sumInvs).padStart(9)}\n`;
    text += `Collections      =  ${fmt(sumColls).padStart(9)}\n`;
    text += `Payments         =  ${fmt(sumLoans).padStart(9)}\n`;
    text += `                 ---------\n`;
    text += `                 =  ${fmt(bf + sumInvs + sumColls - sumLoans).padStart(9)}\n`;

    if (rangeExps.length > 0) {
      rangeExps.forEach((exp) => {
        const desc = `${exp.description} (Expense)`.slice(0, 16).padEnd(16);
        text += `${desc} =  ${fmt(exp.amount).padStart(9)}\n`;
      });
      text += `                 ---------\n`;
    }

    text += `Total            =  ${fmt(netTotal).padStart(9)}`;
    return text;
  }, [bf, calculatedSummary]);

  // PDF Export Trigger
  const handleExportPDF = () => {
    const startTs = parseDDMMYYYY(startDateStr);
    const endTs = parseDDMMYYYY(endDateStr);
    if (!startTs || !endTs) {
      Alert.alert("Invalid Dates", "Please make sure date range inputs are complete and valid in DD/MM/YYYY format.");
      return;
    }

    const { sumInvs, sumColls, sumLoans, rangeExps, netTotal } = calculatedSummary;
    const simpleExpenses = rangeExps.map((e) => ({ amount: e.amount, description: e.description }));

    const exported = openAccountStatementPrint(
      startDateStr,
      endDateStr,
      bf,
      sumInvs,
      sumColls,
      sumLoans,
      simpleExpenses,
      netTotal
    );

    if (exported) {
      Alert.alert("Report Generated", "The printable account statement has been prepared.");
    } else {
      Alert.alert("Web Only Feature", "PDF export via browser printing is available on the Web interface.");
    }
  };

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
                <View>
                  <Text style={styles.heroTitle}>Account Workspace</Text>
                  <Text style={styles.heroSubtitle}>Manage Balancing Fund, Investments & Expenses</Text>
                </View>
              </View>
            </View>

            {/* Tabs Selector */}
            <View style={styles.tabBar}>
              {(["summary", "investments", "expenses"] as const).map((tab) => {
                const active = activeTab === tab;
                const label = tab === "summary" ? "BF & Summary" : tab[0].toUpperCase() + tab.slice(1);
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
                <Text style={styles.loaderText}>Syncing financial data...</Text>
              </View>
            ) : (
              <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
                
                {/* TAB 1: Balancing Fund & Range Summary */}
                {activeTab === "summary" && (
                  <View style={styles.cardContainer}>
                    
                    {/* A. Balancing Fund Configuration */}
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>Balancing Fund (BF)</Text>
                      <Text style={styles.cardDesc}>Enter the starting balance for your ledger books.</Text>
                      
                      <View style={styles.inputContainer}>
                        <Text style={styles.inputLabel}>Starting Amount (Rs.)</Text>
                        <TextInput
                          style={styles.textInput}
                          value={bfInput}
                          onChangeText={setBfInput}
                          keyboardType="numeric"
                          placeholder="e.g. 100000"
                          placeholderTextColor="#78909c"
                        />
                      </View>

                      <Pressable 
                        style={[styles.primaryButton, submitting && styles.btnDisabled]} 
                        onPress={handleSaveBf}
                        disabled={submitting}
                      >
                        <Text style={styles.primaryButtonText}>
                          {submitting ? "Saving..." : "Update Balancing Fund"}
                        </Text>
                      </Pressable>
                    </View>

                    {/* B. Date Range Selector & Summary */}
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>Calculate Period Totals</Text>
                      <Text style={styles.cardDesc}>Select a date range to filter and see calculations.</Text>

                      <View style={styles.datePickerRow}>
                        <View style={[styles.inputContainer, { flex: 1 }]}>
                          <Text style={styles.inputLabel}>Start Date</Text>
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
                          <Text style={styles.inputLabel}>End Date</Text>
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
                        <Text style={styles.breakdownTitle}>Live Summary Breakdown</Text>
                        <Pressable 
                          style={styles.pdfButton} 
                          onPress={handleExportPDF}
                        >
                          <Icon name="document-text-outline" size={14} color="#111827" />
                          <Text style={styles.pdfButtonText}>Export PDF</Text>
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
                      <Text style={styles.cardTitle}>Add Investment</Text>
                      <Text style={styles.cardDesc}>Record capital additions to the Balancing Fund.</Text>

                      <View style={styles.inputContainer}>
                        <Text style={styles.inputLabel}>Investment Amount (Rs.)</Text>
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
                        <Text style={styles.inputLabel}>Date</Text>
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
                          {submitting ? "Adding..." : "Add Investment Entry"}
                        </Text>
                      </Pressable>
                    </View>

                    {/* List investments */}
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>Investment Log</Text>
                      
                      {investments.length === 0 ? (
                        <Text style={styles.emptyText}>No investments recorded yet.</Text>
                      ) : (
                        investments.map((item) => (
                          <View key={item.id} style={styles.logRow}>
                            <View style={styles.logDetails}>
                              <Text style={styles.logAmount}>+ Rs.${item.amount.toLocaleString("en-IN")}</Text>
                              <Text style={styles.logDate}>{formatDDMMYYYY(item.date)}</Text>
                            </View>
                            <Pressable 
                              style={styles.deleteBtn} 
                              onPress={() => handleDeleteInvestment(item.id)}
                              accessibilityLabel="Delete entry"
                            >
                              <Icon name="trash-outline" size={18} color="#d94841" />
                            </Pressable>
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
                      <Text style={styles.cardTitle}>Add Expense</Text>
                      <Text style={styles.cardDesc}>Record company overheads and outgoings.</Text>

                      <View style={styles.inputContainer}>
                        <Text style={styles.inputLabel}>Expense Amount (Rs.)</Text>
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
                        <Text style={styles.inputLabel}>Description</Text>
                        <TextInput
                          style={styles.textInput}
                          value={expDesc}
                          onChangeText={setExpDesc}
                          placeholder="e.g. Petrol, Office Supplies"
                          placeholderTextColor="#78909c"
                        />
                      </View>

                      <View style={styles.inputContainer}>
                        <Text style={styles.inputLabel}>Date</Text>
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
                          {submitting ? "Adding..." : "Add Expense Entry"}
                        </Text>
                      </Pressable>
                    </View>

                    {/* List expenses */}
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>Expense Log</Text>
                      
                      {expenses.length === 0 ? (
                        <Text style={styles.emptyText}>No expenses recorded yet.</Text>
                      ) : (
                        expenses.map((item) => (
                          <View key={item.id} style={styles.logRow}>
                            <View style={styles.logDetails}>
                              <Text style={[styles.logAmount, { color: "#d94841" }]}>
                                - Rs.${item.amount.toLocaleString("en-IN")}
                              </Text>
                              <Text style={styles.logDesc}>{item.description}</Text>
                              <Text style={styles.logDate}>{formatDDMMYYYY(item.date)}</Text>
                            </View>
                            <Pressable 
                              style={styles.deleteBtn} 
                              onPress={() => handleDeleteExpense(item.id)}
                              accessibilityLabel="Delete entry"
                            >
                              <Icon name="trash-outline" size={18} color="#d94841" />
                            </Pressable>
                          </View>
                        ))
                      )}
                    </View>
                  </View>
                )}

              </ScrollView>
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
});
