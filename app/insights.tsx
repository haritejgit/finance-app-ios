import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Dimensions, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/auth-context";
import { AnimatedScreen } from "../src/components/AnimatedScreen";
import { db } from "../src/firebase";
import { askGeminiForecast, type ForecastStats } from "../src/gemini";
import Icon from "../src/Icon";
import { getGradient, shadows } from "../src/theme";
import { useTheme } from "../src/theme-context";
import { Customer, Loan, Payment } from "../src/types";

const weekMs = 7 * 24 * 60 * 60 * 1000;

function toMillis(value: any) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  return 0;
}

function money(value: number) {
  return `Rs.${Math.round(value || 0).toLocaleString("en-IN")}`;
}

function startOfWeek() {
  const date = new Date();
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function riskTone(score: number) {
  if (score < 40) return "#1E7A4C";
  if (score <= 70) return "#FFB347";
  return "#FF6B6B";
}

export default function InsightsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [forecastText, setForecastText] = useState("");
  const [forecastLoading, setForecastLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const customerUnsub = onSnapshot(
      query(collection(db, "customers"), where("userId", "==", user.uid), limit(1500)),
      (snap) => {
        setCustomers(snap.docs.map((docSnap) => docSnap.data() as Customer).filter((customer) => customer.isActive !== false));
        setLoading(false);
      }
    );
    const loanUnsub = onSnapshot(
      query(collection(db, "loans"), where("userId", "==", user.uid), limit(1500)),
      (snap) => setLoans(snap.docs.map((docSnap) => docSnap.data() as Loan))
    );
    const paymentUnsub = onSnapshot(
      query(collection(db, "payments"), where("userId", "==", user.uid), limit(1500)),
      (snap) => setPayments(snap.docs.map((docSnap) => docSnap.data() as Payment))
    );

    return () => {
      customerUnsub();
      loanUnsub();
      paymentUnsub();
    };
  }, [user]);

  const insight = useMemo(() => {
    const now = Date.now();
    const weekStart = startOfWeek();
    const weekEnd = weekStart + weekMs;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStartMs = monthStart.getTime();
    const customersById = new Map(customers.map((customer) => [customer.id, customer]));
    const activeLoans = loans.filter((loan) => loan.status === "ACTIVE" && customersById.has(loan.customerId));
    const activeLoanByCustomer = new Map(activeLoans.map((loan) => [loan.customerId, loan]));
    const customerIdByLoan = new Map(loans.map((loan) => [loan.id, loan.customerId]));
    const averageLoan = activeLoans.length
      ? activeLoans.reduce((sum, loan) => sum + Number(loan.principalAmount || 0), 0) / activeLoans.length
      : 0;

    const regularPayments = payments.filter((payment) => payment.paymentType !== "DUE");
    const actualThisWeek = regularPayments
      .filter((payment) => {
        const ts = toMillis(payment.paymentDate);
        return ts >= weekStart && ts < weekEnd;
      })
      .reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0);
    const expectedThisWeek = activeLoans.reduce((sum, loan) => sum + Math.max(1, Math.round(Number(loan.principalAmount || 0) / 10)), 0);

    const dailyCollectionStreak = Array.from({ length: 7 }, (_, index) => {
      const dayStart = weekStart + index * 24 * 60 * 60 * 1000;
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      return regularPayments.some((payment) => {
        const ts = toMillis(payment.paymentDate);
        return ts >= dayStart && ts < dayEnd;
      });
    });

    const customerRisks = customers
      .map((customer) => {
        const loan = activeLoanByCustomer.get(customer.id);
        if (!loan) return null;
        const customerPayments = payments.filter((payment) => (payment.customerId ?? customerIdByLoan.get(payment.loanId)) === customer.id);
        const missedPayments = customerPayments.filter((payment) => payment.paymentType === "DUE").length;
        const lastRegular = customerPayments
          .filter((payment) => payment.paymentType !== "DUE")
          .map((payment) => toMillis(payment.paymentDate))
          .sort((a, b) => b - a)[0];
        const daysOverdue = lastRegular ? Math.max(0, Math.floor((now - lastRegular) / 86400000) - 7) : 14;
        const consistencyRisk = Math.min(35, missedPayments * 10);
        const overdueRisk = Math.min(45, daysOverdue * 3);
        const amountRisk = averageLoan ? Math.min(20, Math.max(0, (loan.principalAmount / averageLoan - 1) * 20)) : 0;
        return {
          customerId: customer.id,
          customerName: customer.name,
          riskScore: Math.round(Math.min(100, consistencyRisk + overdueRisk + amountRisk)),
          missedPayments,
          daysOverdue,
          loanAmount: loan.principalAmount,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.riskScore - a.riskScore);

    return {
      activeLoans: activeLoans.length,
      distributedThisMonth: loans
        .filter((loan) => toMillis(loan.startDate) >= monthStartMs)
        .reduce((sum, loan) => sum + Number(loan.principalAmount || 0), 0),
      recoveredThisMonth: regularPayments
        .filter((payment) => toMillis(payment.paymentDate) >= monthStartMs)
        .reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0),
      expectedThisWeek,
      actualThisWeek,
      dailyCollectionStreak,
      customerRisks,
    };
  }, [customers, loans, payments]);

  const weekRatio = Math.max(1, insight.expectedThisWeek, insight.actualThisWeek);

  return (
    <AnimatedScreen style={styles.root}>
      <LinearGradient colors={[...getGradient(colors)]} style={styles.root}>
        <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          >
            <View style={styles.content}>
              <View style={styles.header}>
                <Pressable style={styles.backBtn} onPress={() => router.back()}>
                  <Icon name="arrow-back" size={20} color={colors.white} />
                </Pressable>
                <View style={styles.headerCopy}>
                  <Text style={styles.title}>Insights</Text>
                  <Text style={styles.subtitle}>Smart Loan Intelligence</Text>
                </View>
              </View>

              {loading ? (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={[styles.body, { color: colors.textSecondary }]}>Loading live intelligence...</Text>
                </View>
              ) : (
                <>
                  <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Stats</Text>
                    <View style={styles.statsGrid}>
                      <Stat label="Active loans" value={`${insight.activeLoans}`} />
                      <Stat label="Distributed" value={money(insight.distributedThisMonth)} />
                      <Stat label="Recovered" value={money(insight.recoveredThisMonth)} />
                    </View>
                  </View>

                  <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Collection Forecast</Text>
                    <Bar label="Expected" value={insight.expectedThisWeek} max={weekRatio} color={colors.warning} />
                    <Bar label="Actual" value={insight.actualThisWeek} max={weekRatio} color={colors.success} />
                  </View>

                  <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Daily Collection Streak</Text>
                    <View style={styles.streakRow}>
                      {insight.dailyCollectionStreak.map((filled, index) => (
                        <View
                          key={index}
                          style={[styles.streakDot, { backgroundColor: filled ? colors.success : colors.grayLight, borderColor: colors.border }]}
                        />
                      ))}
                    </View>
                  </View>

                  <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Risk Score per Customer</Text>
                    {insight.customerRisks.slice(0, 8).map((item) => (
                      <Pressable key={item.customerId} style={styles.riskRow} onPress={() => router.push(`/profile/${item.customerId}`)}>
                        <View style={styles.riskCopy}>
                          <Text style={[styles.customerName, { color: colors.text }]}>{item.customerName}</Text>
                          <Text style={[styles.body, { color: colors.textSecondary }]}>
                            {item.missedPayments} missed | {item.daysOverdue} days overdue | {money(item.loanAmount)}
                          </Text>
                        </View>
                        <Text style={[styles.riskBadge, { backgroundColor: riskTone(item.riskScore) }]}>{item.riskScore}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Top Defaulters</Text>
                    {insight.customerRisks
                      .filter((item) => item.missedPayments > 0)
                      .slice(0, 5)
                      .map((item, index) => (
                        <View key={item.customerId} style={styles.defaulterRow}>
                          <Text style={[styles.customerName, { color: colors.text }]}>{index + 1}. {item.customerName}</Text>
                          <Text style={[styles.flames, { color: colors.error }]}>{"🔥".repeat(Math.min(3, Math.max(1, item.missedPayments)))}</Text>
                        </View>
                      ))}
                  </View>

                  {/* ── AI Forecast ── */}
                  <View style={[styles.card, { backgroundColor: "#0D1E30", borderColor: "rgba(212,175,106,0.3)" }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(212,175,106,0.15)", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="sparkles-outline" size={15} color="#D4AF6A" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "900" }}>AI Business Forecast</Text>
                        <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: "600" }}>Powered by Gemini AI</Text>
                      </View>
                    </View>

                    {forecastText ? (
                      <Text style={{ color: "rgba(255,255,255,0.88)", fontSize: 13, lineHeight: 20, fontWeight: "500" }}>
                        {forecastText}
                      </Text>
                    ) : (
                      <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "600" }}>
                        Get AI-powered predictions for defaults, cash flow trends, and best lending months.
                      </Text>
                    )}

                    <Pressable
                      style={[styles.forecastBtn, forecastLoading && { opacity: 0.6 }]}
                      disabled={forecastLoading}
                      onPress={async () => {
                        setForecastLoading(true);
                        const overdue = insight.customerRisks.filter(r => r.riskScore > 60).length;
                        const totalCustomers = insight.customerRisks.length;
                        const stats: ForecastStats = {
                          totalCustomers,
                          activeLoans: insight.activeLoans,
                          todayCollection: 0,
                          monthCollection: insight.recoveredThisMonth,
                          overdueCount: overdue,
                          monthDistributed: insight.distributedThisMonth,
                          totalDistributed: insight.distributedThisMonth,
                          totalCollected: insight.recoveredThisMonth,
                          onTimePaymentRate: totalCustomers > 0 ? Math.round(((totalCustomers - overdue) / totalCustomers) * 100) : 100,
                          overdueRate: totalCustomers > 0 ? Math.round((overdue / totalCustomers) * 100) : 0,
                          avgLoanAmount: loans.length > 0 ? loans.reduce((s, l) => s + Number(l.principalAmount || 0), 0) / loans.length : 0,
                          weeklyCollections: [],
                        };
                        const result = await askGeminiForecast(stats);
                        setForecastText(result);
                        setForecastLoading(false);
                      }}
                    >
                      {forecastLoading ? (
                        <ActivityIndicator size="small" color="#12294A" />
                      ) : (
                        <Icon name="sparkles-outline" size={14} color="#12294A" />
                      )}
                      <Text style={styles.forecastBtnText}>
                        {forecastLoading ? "Generating..." : forecastText ? "Regenerate Forecast" : "Generate AI Forecast"}
                      </Text>
                    </Pressable>
                  </View>

                </>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </AnimatedScreen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.barWrap}>
      <View style={styles.barHeader}>
        <Text style={[styles.body, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.bodyStrong, { color }]}>{money(value)}</Text>
      </View>
      <View style={[styles.barTrack, { backgroundColor: colors.grayLight }]}>
        <View style={[styles.barFill, { width: `${Math.min(100, (value / max) * 100)}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const screenWidth = Dimensions.get("window").width;

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 10 },
  content: { width: "100%", maxWidth: Math.min(screenWidth - 32, 430), alignSelf: "center", gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 42, height: 42, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.16)", borderWidth: 1, borderColor: "rgba(255,255,255,0.24)" },
  headerCopy: { flex: 1 },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" },
  subtitle: { color: "rgba(255,255,255,0.76)", fontSize: 14, fontWeight: "600" },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12, ...Platform.select({ ios: shadows.xl, android: shadows.xl, default: shadows.lg }) },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  body: { fontSize: 14, fontWeight: "400" },
  bodyStrong: { fontSize: 14, fontWeight: "700" },
  statsGrid: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, minHeight: 74, borderRadius: 14, borderWidth: 1, padding: 10, justifyContent: "center" },
  statValue: { fontSize: 16, fontWeight: "800" },
  statLabel: { fontSize: 11, fontWeight: "700", marginTop: 4 },
  barWrap: { gap: 6 },
  barHeader: { flexDirection: "row", justifyContent: "space-between" },
  barTrack: { height: 14, borderRadius: 999, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 999 },
  streakRow: { flexDirection: "row", justifyContent: "space-between" },
  streakDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 1 },
  riskRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  riskCopy: { flex: 1 },
  customerName: { fontSize: 14, fontWeight: "800" },
  riskBadge: { minWidth: 44, overflow: "hidden", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, color: "#FFFFFF", textAlign: "center", fontSize: 13, fontWeight: "900" },
  defaulterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 7 },
  flames: { fontSize: 15, fontWeight: "800" },
  forecastBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#D4AF6A", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginTop: 4 },
  forecastBtnText: { color: "#12294A", fontSize: 14, fontWeight: "900" },
});
