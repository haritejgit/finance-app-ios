import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/auth-context";
import { AnimatedScreen } from "../src/components/AnimatedScreen";
import Icon from "../src/Icon";
import { colors } from "../src/theme";
import { useTheme } from "../src/theme-context";
import { db } from "../src/firebase";
import { collection, query, where, onSnapshot, Unsubscribe } from "firebase/firestore";
import { Customer, Loan, Payment, Village, PaymentMode } from "../src/types";
import { getOrDeriveCycleStartDay, getPersonalCycleStartTs, addPayment } from "../src/repository";
import { isRealCollectionPayment, toMillis, weekStart } from "../src/business-logic";
import { showToast } from "../src/notify";

function getSuggestedPaymentAmount(loan?: Loan | null) {
  if (!loan) return 0;
  const principalVal = loan.principalAmount ?? loan.principal_amount ?? loan.loanAmount ?? loan.amount;
  const principal = Number(principalVal);
  const balance = Number(loan.balanceAmount ?? 0);
  
  const safePrincipal = Number.isFinite(principal) && principal > 0 ? principal : 0;
  const safeBalance = Number.isFinite(balance) && balance > 0 ? balance : 0;

  const standardAmount = Math.max(1, Math.round(safePrincipal / 10));
  return Math.min(standardAmount, safeBalance);
}

function formatDateInput(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function RemindersScreen() {
  const { user } = useAuth();
  const { colors: themeColors } = useTheme();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [villages, setVillages] = useState<Village[]>([]);

  // Inline Payment Modal State
  const [payOpen, setPayOpen] = useState(false);
  const [payCustomer, setPayCustomer] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState<PaymentMode>("CASH");
  const [payDateInput, setPayDateInput] = useState(formatDateInput(Date.now()));
  const [payError, setPayError] = useState("");
  const [paySaving, setPaySaving] = useState(false);

  // Subscribe to collections in real time
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const qCustomers = query(collection(db, "customers"), where("userId", "==", user.uid));
    const qLoans = query(collection(db, "loans"), where("userId", "==", user.uid));
    const qPayments = query(collection(db, "payments"), where("userId", "==", user.uid));
    const qVillages = query(collection(db, "villages"), where("userId", "==", user.uid));

    const unsubC = onSnapshot(qCustomers, (snap) => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Customer).filter(c => c.isActive !== false));
    });

    const unsubL = onSnapshot(qLoans, (snap) => {
      setLoans(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Loan));
    });

    const unsubP = onSnapshot(qPayments, (snap) => {
      setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Payment));
    });

    const unsubV = onSnapshot(qVillages, (snap) => {
      setVillages(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Village));
      setLoading(false);
    });

    return () => {
      unsubC();
      unsubL();
      unsubP();
      unsubV();
    };
  }, [user]);

  const villageMap = useMemo(() => new Map(villages.map(v => [v.id, v])), [villages]);
  const activeLoansByCustomerId = useMemo(() => {
    const active = loans.filter(l => l.status === "ACTIVE" && l.balanceAmount > 0);
    return new Map(active.map(l => [l.customerId, l]));
  }, [loans]);

  // Compute Metrics & Reminders List
  const now = Date.now();
  const weekStartVal = useMemo(() => weekStart(now), [now]);

  const remindersList = useMemo(() => {
    const list: {
      customer: Customer;
      loan: Loan;
      villageName: string;
      expectedAmount: number;
      streak: number;
      daysRemaining: number;
      whatsappUrl: string;
    }[] = [];

    customers.forEach((c) => {
      const loan = activeLoansByCustomerId.get(c.id);
      if (!loan) return;

      const cycleStartDay = getOrDeriveCycleStartDay(c, loan.startDate);
      // First cycle starts 7 days after loan start date
      const firstCycleStart = getPersonalCycleStartTs(loan.startDate + 7 * 24 * 60 * 60 * 1000, cycleStartDay);
      if (firstCycleStart > now) return; // Not active yet (first week is grace period)

      const currentCycleStartTs = getPersonalCycleStartTs(now, cycleStartDay);
      
      // Check if they paid in the current cycle week
      const customerPayments = payments.filter(p => p.loanId === loan.id);
      const hasPaidCurrentCycle = customerPayments.some((p) => {
        return isRealCollectionPayment(p) && getPersonalCycleStartTs(toMillis(p.paymentDate), cycleStartDay) === currentCycleStartTs;
      });

      if (hasPaidCurrentCycle) return; // Already paid

      // Calculate Streak of unpaid completed cycles (weeks before current week)
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      const completedWeeks = Math.max(0, Math.floor((now - firstCycleStart) / oneWeek));

      const paidWeeks = new Set<number>();
      customerPayments.forEach((p) => {
        if (!isRealCollectionPayment(p)) return;
        const diffMs = getPersonalCycleStartTs(toMillis(p.paymentDate), cycleStartDay) - firstCycleStart;
        if (diffMs >= 0) {
          paidWeeks.add(Math.floor(diffMs / oneWeek));
        }
      });

      let streak = 0;
      for (let i = completedWeeks - 1; i >= 0; i--) {
        if (paidWeeks.has(i)) {
          break;
        }
        streak++;
      }

      // Calculate Days Remaining in current cycle
      const nextCycleStart = currentCycleStartTs + oneWeek;
      const daysRemaining = Math.max(0, Math.ceil((nextCycleStart - now) / (24 * 60 * 60 * 1000)));

      // WhatsApp share msg link
      const village = villageMap.get(c.villageId);
      const villageName = village?.name ?? "No village";
      const expectedAmount = getSuggestedPaymentAmount(loan);

      const phoneDigits = c.phone.replace(/\D/g, "");
      const normalizedPhone = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits;
      const reminderMsg = `Hi ${c.name}, this is a payment reminder for your loan. Please pay this week's amount Rs.${expectedAmount.toLocaleString("en-IN")} ASAP. Outstanding balance: Rs.${Math.round(loan.balanceAmount).toLocaleString("en-IN")}. Thank you!`;
      const whatsappUrl = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(reminderMsg)}`;

      list.push({
        customer: c,
        loan,
        villageName,
        expectedAmount,
        streak,
        daysRemaining,
        whatsappUrl,
      });
    });

    // Sort: Village name asc, Customer name asc
    return list.sort((a, b) => {
      const vComp = a.villageName.localeCompare(b.villageName);
      if (vComp !== 0) return vComp;
      return a.customer.name.localeCompare(b.customer.name);
    });
  }, [customers, activeLoansByCustomerId, payments, villageMap, now]);

  // Summary Card calculations
  const summary = useMemo(() => {
    let totalExpected = 0;
    // Expected weekly collection across all active loans where loan started before this calendar week
    loans.forEach((l) => {
      if (l.status === "ACTIVE" && l.balanceAmount > 0 && toMillis(l.startDate) < weekStartVal) {
        totalExpected += getSuggestedPaymentAmount(l);
      }
    });

    // Collected so far this calendar week
    const collectedThisWeek = payments
      .filter((p) => isRealCollectionPayment(p) && toMillis(p.paymentDate) >= weekStartVal)
      .reduce((sum, p) => sum + p.amountPaid, 0);

    const remaining = Math.max(0, totalExpected - collectedThisWeek);

    return {
      expected: totalExpected,
      collected: collectedThisWeek,
      remaining,
    };
  }, [loans, payments, weekStartVal]);

  const openPayModal = (c: Customer) => {
    const l = activeLoansByCustomerId.get(c.id);
    if (!l) return;
    setPayCustomer(c);
    setPayAmount(getSuggestedPaymentAmount(l).toString());
    setPayMode("CASH");
    setPayDateInput(formatDateInput(Date.now()));
    setPayError("");
    setPayOpen(true);
  };

  const closePayModal = () => {
    setPayOpen(false);
    setPayCustomer(null);
    setPayAmount("");
    setPayError("");
  };

  const confirmInlinePayment = async () => {
    if (!payCustomer) return;
    const loan = activeLoansByCustomerId.get(payCustomer.id);
    if (!loan) return;

    const amount = Number(payAmount);
    if (isNaN(amount) || amount <= 0) {
      setPayError("Enter a valid payment amount");
      return;
    }
    if (amount > loan.balanceAmount) {
      setPayError(`Amount cannot exceed Rs.${Math.round(loan.balanceAmount)}.`);
      return;
    }

    const matchDate = /^\d{4}-\d{2}-\d{2}$/.exec(payDateInput.trim());
    if (!matchDate) {
      setPayError("Enter date as YYYY-MM-DD");
      return;
    }

    const year = Number(matchDate[1]);
    const month = Number(matchDate[2]) - 1;
    const day = Number(matchDate[3]);
    const dateObj = new Date(year, month, day);
    const timeVal = dateObj.getTime();

    const finalDate = (new Date(timeVal).toDateString() === new Date().toDateString()) ? Date.now() : timeVal;

    try {
      setPaySaving(true);
      await addPayment(loan, amount, finalDate, payMode);
      showToast("success", "Payment recorded", `Rs.${amount} collected from ${payCustomer.name}`);
      closePayModal();
    } catch {
      Alert.alert("Error", "Could not save payment. Please try again.");
    } finally {
      setPaySaving(false);
    }
  };

  return (
    <AnimatedScreen style={styles.root}>
      <LinearGradient colors={["#0D1B2A", "#14213D"]} style={StyleSheet.absoluteFillObject} />
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Icon name="arrow-back" size={20} color={colors.white} />
          </Pressable>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>Today's Collections</Text>
            <Text style={styles.subtitle}>Weekly reminders & pending tasks</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#00D4AA" />
          </View>
        ) : (
          <FlatList
            data={remindersList}
            keyExtractor={(item) => item.customer.id}
            ListHeaderComponent={
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>This Week's Collections Summary</Text>
                <View style={styles.summaryMetrics}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Expected</Text>
                    <Text style={styles.metricVal}>Rs.{Math.round(summary.expected).toLocaleString("en-IN")}</Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Collected</Text>
                    <Text style={[styles.metricVal, { color: "#00C896" }]}>Rs.{Math.round(summary.collected).toLocaleString("en-IN")}</Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Remaining</Text>
                    <Text style={[styles.metricVal, { color: "#EF5350" }]}>Rs.{Math.round(summary.remaining).toLocaleString("en-IN")}</Text>
                  </View>
                </View>
              </View>
            }
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Icon name="checkmark" size={48} color="#00C896" />
                <Text style={styles.emptyText}>All caught up! No pending collections for active cycles.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.custName}>{item.customer.name}</Text>
                    <Text style={styles.villageName}>Village: {item.villageName}</Text>
                  </View>
                  {item.streak > 0 && (
                    <View style={styles.streakBadge}>
                      <Text style={styles.streakText}>⚠️ {item.streak} weeks due</Text>
                    </View>
                  )}
                </View>

                <View style={styles.itemMetrics}>
                  <View style={styles.itemMetric}>
                    <Text style={styles.itemMetricLabel}>Expected</Text>
                    <Text style={styles.itemMetricVal}>Rs.{Math.round(item.expectedAmount).toLocaleString("en-IN")}</Text>
                  </View>
                  <View style={styles.itemMetric}>
                    <Text style={styles.itemMetricLabel}>Outstanding</Text>
                    <Text style={styles.itemMetricVal}>Rs.{Math.round(item.loan.balanceAmount).toLocaleString("en-IN")}</Text>
                  </View>
                  <View style={styles.itemMetric}>
                    <Text style={styles.itemMetricLabel}>Days Left</Text>
                    <Text style={[styles.itemMetricVal, item.daysRemaining <= 2 && { color: "#EF5350" }]}>
                      {item.daysRemaining} days
                    </Text>
                  </View>
                </View>

                <View style={styles.actionsRow}>
                  {item.customer.phone ? (
                    <Pressable
                      style={styles.actionIconButton}
                      onPress={() => {
                        Linking.openURL(item.whatsappUrl).catch(() => {
                          Alert.alert("Error", "Could not open WhatsApp.");
                        });
                      }}
                    >
                      <Icon name="logo-whatsapp" size={18} color="#00C896" />
                      <Text style={styles.whatsappLabel}>{item.customer.phone}</Text>
                    </Pressable>
                  ) : null}

                  <Pressable style={styles.markPaidBtn} onPress={() => openPayModal(item.customer)}>
                    <Icon name="cash" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.markPaidText}>Mark Paid</Text>
                  </Pressable>
                </View>
              </View>
            )}
          />
        )}
      </SafeAreaView>

      {/* Inline Recording Modal */}
      <Modal visible={payOpen} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Record Payment</Text>
            {payCustomer && (
              <Text style={styles.modalSubtitle}>Customer: {payCustomer.name}</Text>
            )}

            <TextInput
              placeholder="Amount Paid"
              placeholderTextColor="#8F9BB3"
              value={payAmount}
              onChangeText={setPayAmount}
              style={styles.modalInput}
              keyboardType="numeric"
            />

            <Text style={styles.sectionLabel}>Payment Mode</Text>
            <View style={styles.modeRow}>
              {(["CASH", "PHONE"] as const).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setPayMode(m)}
                  style={[
                    styles.chip,
                    payMode === m && styles.chipOn,
                    payMode === m && m === "PHONE" && styles.chipPhoneOn,
                  ]}
                >
                  <Text style={payMode === m ? styles.chipOnText : styles.chipText}>
                    {m === "PHONE" ? "PhonePe" : "Cash"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Payment Date (YYYY-MM-DD)</Text>
            <TextInput
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#8F9BB3"
              value={payDateInput}
              onChangeText={setPayDateInput}
              style={styles.modalInput}
            />

            {payError ? <Text style={styles.errorText}>{payError}</Text> : null}

            <View style={styles.modalButtons}>
              <Pressable style={styles.cancelModalBtn} onPress={closePayModal}>
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primary} onPress={confirmInlinePayment} disabled={paySaving}>
                {paySaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryText}>Confirm</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </AnimatedScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  titleContainer: { flex: 1 },
  title: {
    color: colors.white,
    fontSize: 20,
    fontWeight: "800",
  },
  subtitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    marginTop: 2,
  },
  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 40,
  },
  summaryCard: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    marginTop: 4,
  },
  summaryTitle: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  summaryMetrics: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metricItem: {
    flex: 1,
    alignItems: "center",
  },
  metricLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 4,
  },
  metricVal: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "800",
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    textAlign: "center",
    maxWidth: 260,
    lineHeight: 20,
  },
  itemCard: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 8,
  },
  custName: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
  },
  villageName: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    marginTop: 2,
  },
  streakBadge: {
    backgroundColor: "rgba(239, 83, 80, 0.15)",
    borderColor: "rgba(239, 83, 80, 0.3)",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  streakText: {
    color: "#FF8A80",
    fontSize: 11,
    fontWeight: "700",
  },
  itemMetrics: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  itemMetric: {
    alignItems: "center",
    flex: 1,
  },
  itemMetricLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 10,
    fontWeight: "600",
    marginBottom: 3,
  },
  itemMetricVal: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "700",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  actionIconButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 200, 150, 0.12)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  whatsappLabel: {
    color: "#00C896",
    fontSize: 11,
    fontWeight: "700",
  },
  markPaidBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1565C0",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginLeft: "auto",
  },
  markPaidText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "700",
  },

  // Modal styling
  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 20,
  },
  modal: {
    backgroundColor: "#1E2A3A",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.white,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    color: colors.white,
    fontSize: 14,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.6)",
    marginBottom: 6,
    marginTop: 4,
  },
  modeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "transparent",
  },
  chipOn: {
    borderColor: "#1565C0",
    backgroundColor: "#1565C0",
  },
  chipPhoneOn: {
    borderColor: "#5F259F",
    backgroundColor: "#5F259F",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.6)",
  },
  chipOnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.white,
  },
  errorText: {
    color: "#EF5350",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  cancelModalBtn: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelModalBtnText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    fontWeight: "700",
  },
  primary: {
    flex: 1,
    backgroundColor: "#00C896",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "700",
  },
});
