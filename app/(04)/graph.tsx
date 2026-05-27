import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth-context";
import { AnimatedScreen } from "../../src/components/AnimatedScreen";
import { getDashboardAnalytics, type DashboardAnalytics } from "../../src/finance-analytics";
import Icon from "../../src/Icon";
import { getAllTimeTotals } from "../../src/repository";
import { formatAmountInKM } from "../../src/utils";

function formatMoney(value: number) {
  return `Rs.${Math.round(value || 0).toLocaleString("en-IN")}`;
}

function formatIndianCurrency(value: number) {
  return `Rs.${Math.round(value || 0).toLocaleString("en-IN")}`;
}

function LifetimeCard({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: string;
  tone: string;
}) {
  return (
    <View style={styles.lifetimeCard}>
      <View style={[styles.lifetimeIcon, { backgroundColor: `${tone}18` }]}>
        <Icon name={icon} size={21} color={tone} />
      </View>
      <Text style={styles.lifetimeLabel}>{label}</Text>
      <Text style={[styles.lifetimeValue, { color: tone }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.74}>
        {value}
      </Text>
      <Text style={styles.lifetimeSub}>{sub}</Text>
    </View>
  );
}

function MetricCard({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: string;
  tone: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: `${tone}18` }]}>
        <Icon name={icon} size={18} color={tone} />
      </View>
      <View style={styles.metricCopy}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {value}
        </Text>
        <Text style={styles.metricSub}>{sub}</Text>
      </View>
    </View>
  );
}

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

function InsightCard({ insight, index }: { insight: string; index: number }) {
  const palette = ["#2563EB", "#10B981", "#F97316", "#EF4444"];
  const tone = palette[index % palette.length];
  return (
    <View style={styles.insightCard}>
      <View style={[styles.insightIcon, { backgroundColor: `${tone}18` }]}>
        <Icon name={index === 0 ? "sparkles-outline" : index === 1 ? "analytics-outline" : "alert-circle-outline"} size={18} color={tone} />
      </View>
      <View style={styles.insightCopy}>
        <Text style={styles.insightTitle}>Business Insight {index + 1}</Text>
        <Text style={styles.insightText}>{insight}</Text>
      </View>
    </View>
  );
}

function TrendChart({ analytics }: { analytics: DashboardAnalytics }) {
  const maxValue = Math.max(...analytics.weeklyTrend.map((item) => Math.max(item.collection, item.distribution)), 1);

  return (
    <View style={styles.chart}>
      {analytics.weeklyTrend.map((week) => (
        <View key={week.label} style={styles.chartColumn}>
          <View style={styles.chartBarWrap}>
            <View style={[styles.chartBar, styles.outBar, { height: Math.max(7, (week.distribution / maxValue) * 134) }]} />
            <View style={[styles.chartBar, styles.inBar, { height: Math.max(7, (week.collection / maxValue) * 148) }]} />
          </View>
          <Text style={styles.chartAmount}>{formatAmountInKM(week.collection, 0)}</Text>
          <Text style={styles.chartLabel}>{week.label}</Text>
        </View>
      ))}
    </View>
  );
}

export default function GraphScreen() {
  const { user, loading: authLoading } = useAuth();
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [allTimeTotals, setAllTimeTotals] = useState<{ distributed: number; collected: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showLoader = true) => {
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (showLoader) setLoading(true);
    try {
      const [nextAnalytics, nextAllTimeTotals] = await Promise.all([
        getDashboardAnalytics(user.uid),
        getAllTimeTotals(),
      ]);
      setAnalytics(nextAnalytics);
      setAllTimeTotals(nextAllTimeTotals);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (authLoading) return;
      load();
    }, [authLoading, load])
  );

  const recoveryRate = useMemo(() => {
    if (!analytics || analytics.totals.distributedThisMonth <= 0) return 0;
    return (analytics.totals.monthlyRevenue / analytics.totals.distributedThisMonth) * 100;
  }, [analytics]);

  const netPosition = useMemo(() => {
    if (!analytics) return 0;
    return analytics.totals.totalCollection - analytics.totals.pendingAmount;
  }, [analytics]);

  const lifetimeNet = (allTimeTotals?.collected ?? 0) - (allTimeTotals?.distributed ?? 0);
  const insightList = analytics ? analytics.insights.concat(analytics.aiInsights).slice(0, 5) : [];

  const sendRiskReminder = useCallback((alert: DashboardAnalytics["dueAlerts"][number]) => {
    const digits = alert.phone.replace(/\D/g, "");
    if (!digits) {
      Alert.alert("Missing phone", "This customer does not have a valid phone number.");
      return;
    }
    const normalized = digits.length === 10 ? `91${digits}` : digits;
    const message = `Hi ${alert.customerName}, you have ${alert.dueCount} pending due${alert.dueCount === 1 ? "" : "s"}. Please pay due amount Rs.${Math.round(alert.dueAmount).toLocaleString("en-IN")} and this week's amount Rs.${Math.round(alert.weeklyAmount).toLocaleString("en-IN")} ASAP.`;
    Linking.openURL(`https://wa.me/${normalized}?text=${encodeURIComponent(message)}`).catch(() => {
      Alert.alert("WhatsApp unavailable", "Could not open WhatsApp reminder.");
    });
  }, []);

  if (loading && !analytics) {
    return (
      <AnimatedScreen style={styles.root}>
        <LinearGradient colors={["#07111F", "#102A43", "#143C5C"]} style={styles.root}>
          <SafeAreaView style={styles.safe}>
            <View style={styles.loading}>
              <ActivityIndicator size="large" color="#FFFFFF" />
              <Text style={styles.loadingText}>Loading business intelligence...</Text>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </AnimatedScreen>
    );
  }

  return (
    <AnimatedScreen style={styles.root}>
      <LinearGradient colors={["#07111F", "#102A43", "#143C5C"]} style={styles.root}>
        <SafeAreaView style={styles.safe}>
          <ScrollView
            contentContainerStyle={styles.container}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(false); }} tintColor="#FFFFFF" />}
          >
            <View style={styles.content}>
              <View style={styles.hero}>
                <Pressable accessibilityLabel="Go back" style={styles.backBtn} onPress={() => router.back()}>
                  <Icon name="arrow-back" size={19} color="#0F172A" />
                </Pressable>
                <View style={styles.heroCopy}>
                  <Text style={styles.eyebrow}>Business insights</Text>
                  <Text style={styles.title}>Analytics Command Center</Text>
                  <Text style={styles.subtitle}>Lifetime money, recovery health, and follow-up priorities in one view.</Text>
                </View>
                <View style={[styles.netPill, netPosition >= 0 ? styles.netPillGood : styles.netPillRisk]}>
                  <Icon name={netPosition >= 0 ? "trending-up" : "trending-down"} size={17} color={netPosition >= 0 ? "#10B981" : "#EF4444"} />
                  <Text style={[styles.netPillText, { color: netPosition >= 0 ? "#10B981" : "#EF4444" }]}>
                    {formatMoney(netPosition)}
                  </Text>
                </View>
              </View>

              <View style={styles.lifetimeGrid}>
                <LifetimeCard
                  label="Total Distributed"
                  value={formatIndianCurrency(allTimeTotals?.distributed ?? 0)}
                  sub="Since business started"
                  icon="arrow-up-outline"
                  tone="#F97316"
                />
                <LifetimeCard
                  label="Total Collected"
                  value={formatIndianCurrency(allTimeTotals?.collected ?? 0)}
                  sub="Since business started"
                  icon="arrow-down"
                  tone="#10B981"
                />
                <LifetimeCard
                  label="Lifetime Net"
                  value={formatIndianCurrency(lifetimeNet)}
                  sub="Collected minus distributed"
                  icon={lifetimeNet >= 0 ? "trending-up" : "trending-down"}
                  tone={lifetimeNet >= 0 ? "#2563EB" : "#EF4444"}
                />
              </View>

              {analytics ? (
                <>
                  <View style={styles.metricGrid}>
                    <MetricCard label="This Month" value={formatMoney(analytics.totals.monthlyRevenue)} sub="Collected revenue" icon="cash-outline" tone="#10B981" />
                    <MetricCard label="Distributed" value={formatMoney(analytics.totals.distributedThisMonth)} sub="Fresh money this month" icon="wallet-outline" tone="#F97316" />
                    <MetricCard label="Recovery Rate" value={`${recoveryRate.toFixed(0)}%`} sub="Collected vs distributed" icon="analytics-outline" tone="#2563EB" />
                    <MetricCard label="Active Loans" value={`${analytics.totals.activeLoanCount}`} sub={`${analytics.totals.customerCount} customers`} icon="people-outline" tone="#8B5CF6" />
                  </View>

                  <Section
                    title="Business Insights"
                    subtitle="Generated from your existing transactions"
                    action={<Text style={styles.sectionBadge}>{insightList.length} signals</Text>}
                  >
                    <View style={styles.insightGrid}>
                      {insightList.length ? (
                        insightList.map((insight, index) => <InsightCard key={insight} insight={insight} index={index} />)
                      ) : (
                        <Text style={styles.empty}>Insights will appear after analytics data is available.</Text>
                      )}
                    </View>
                  </Section>

                  <Section
                    title="Money Movement"
                    subtitle="Collections and distributions by week"
                    action={
                      <View style={styles.legend}>
                        <View style={[styles.legendDot, { backgroundColor: "#2563EB" }]} />
                        <Text style={styles.legendText}>Collected</Text>
                        <View style={[styles.legendDot, { backgroundColor: "#F97316" }]} />
                        <Text style={styles.legendText}>Distributed</Text>
                      </View>
                    }
                  >
                    <TrendChart analytics={analytics} />
                  </Section>

                  <Section
                    title="Risk Queue"
                    subtitle={`${analytics.dueAlerts.length} active follow-ups`}
                    action={<Text style={styles.sectionBadge}>{analytics.totals.dueMarksThisMonth} due marks</Text>}
                  >
                    {analytics.dueAlerts.length ? (
                      analytics.dueAlerts.map((alert) => (
                        <View key={alert.customerId} style={styles.row}>
                          <View style={styles.alertIcon}>
                            <Icon name="alert-circle-outline" size={17} color="#EF4444" />
                          </View>
                          <View style={styles.rowCopy}>
                            <Text style={styles.rowTitle}>{alert.customerName}</Text>
                            <Text style={styles.rowMeta}>
                              {alert.villageName} | {alert.dueCount} dues | Due {formatMoney(alert.dueAmount)} | Week {formatMoney(alert.weeklyAmount)}
                            </Text>
                          </View>
                          <Pressable accessibilityLabel={`WhatsApp ${alert.customerName}`} style={styles.whatsappBtn} onPress={() => sendRiskReminder(alert)}>
                            <Icon name="logo-whatsapp" size={17} color="#10B981" />
                          </Pressable>
                          <Pressable accessibilityLabel={`Open ${alert.customerName}`} style={styles.openBtn} onPress={() => router.push(`/profile/${alert.customerId}`)}>
                            <Icon name="arrow-forward" size={16} color="#2563EB" />
                          </Pressable>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.empty}>No high-risk active loans right now.</Text>
                    )}
                  </Section>

                  <Section title="Recent Collections" subtitle="Latest successful payments">
                    {analytics.recentTransactions.length ? (
                      analytics.recentTransactions.map((item) => (
                        <Pressable
                          key={item.id}
                          style={styles.row}
                          onPress={() => item.customerId && router.push(`/profile/${item.customerId}`)}
                        >
                          <View style={styles.collectionIcon}>
                            <Icon name={item.paymentMode === "PHONE" ? "phone-portrait-outline" : "cash-outline"} size={16} color="#2563EB" />
                          </View>
                          <View style={styles.rowCopy}>
                            <Text style={styles.rowTitle}>{item.customerName}</Text>
                            <Text style={styles.rowMeta}>
                              {item.villageName} | {new Date(item.paymentDate).toLocaleDateString("en-IN")}
                            </Text>
                          </View>
                          <Text style={styles.collectionAmount}>{formatMoney(item.amountPaid)}</Text>
                        </Pressable>
                      ))
                    ) : (
                      <Text style={styles.empty}>Collections will appear here after payments are recorded.</Text>
                    )}
                  </Section>
                </>
              ) : (
                <Section title="Business Insights" subtitle="Sign in to load analytics">
                  <Text style={styles.empty}>Analytics data will appear after your account is loaded.</Text>
                </Section>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </AnimatedScreen>
  );
}

const screenWidth = Dimensions.get("window").width;

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  container: { padding: 16, paddingBottom: 34 },
  content: { width: "100%", maxWidth: Math.min(screenWidth - 32, 1120), alignSelf: "center", gap: 13 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  hero: {
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    padding: 14,
    gap: 12,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#020617",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 5,
  },
  backBtn: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#E0F2FE" },
  heroCopy: { flex: 1 },
  eyebrow: { color: "#64748B", fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  title: { color: "#0F172A", fontSize: 24, lineHeight: 29, fontWeight: "900" },
  subtitle: { color: "#64748B", fontSize: 12, lineHeight: 18, fontWeight: "800", marginTop: 2 },
  netPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8 },
  netPillGood: { backgroundColor: "#DCFCE7" },
  netPillRisk: { backgroundColor: "#FEE2E2" },
  netPillText: { fontSize: 12, fontWeight: "900" },
  lifetimeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  lifetimeCard: {
    flexGrow: 1,
    flexBasis: "31%",
    minWidth: 178,
    minHeight: 142,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
  },
  lifetimeIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  lifetimeLabel: { color: "#64748B", fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  lifetimeValue: { fontSize: 24, lineHeight: 29, fontWeight: "900", marginTop: 3 },
  lifetimeSub: { color: "#64748B", fontSize: 11, fontWeight: "800", marginTop: 2 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 164,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  metricIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  metricCopy: { flex: 1, minWidth: 0 },
  metricLabel: { color: "#64748B", fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  metricValue: { color: "#0F172A", fontSize: 19, lineHeight: 24, fontWeight: "900", marginTop: 2 },
  metricSub: { color: "#64748B", fontSize: 11, fontWeight: "800", marginTop: 1 },
  section: { borderRadius: 20, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", padding: 14, gap: 12 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  sectionCopy: { flex: 1 },
  sectionTitle: { color: "#0F172A", fontSize: 19, lineHeight: 23, fontWeight: "900" },
  sectionSub: { color: "#64748B", fontSize: 11, fontWeight: "800", marginTop: 2 },
  sectionBadge: { overflow: "hidden", borderRadius: 999, backgroundColor: "#DBEAFE", color: "#2563EB", paddingHorizontal: 10, paddingVertical: 6, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  insightGrid: { gap: 9 },
  insightCard: { borderRadius: 16, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", padding: 12, flexDirection: "row", gap: 11 },
  insightIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  insightCopy: { flex: 1 },
  insightTitle: { color: "#0F172A", fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  insightText: { color: "#475569", fontSize: 13, lineHeight: 19, fontWeight: "800", marginTop: 3 },
  legend: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap", justifyContent: "flex-end", flex: 1 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: "#64748B", fontSize: 10, fontWeight: "900" },
  chart: { height: 184, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 7 },
  chartColumn: { flex: 1, alignItems: "center", gap: 5 },
  chartBarWrap: { height: 150, flexDirection: "row", alignItems: "flex-end", gap: 3 },
  chartBar: { width: 10, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  inBar: { width: 13, backgroundColor: "#2563EB" },
  outBar: { backgroundColor: "#F97316" },
  chartAmount: { color: "#475569", fontSize: 9, fontWeight: "900" },
  chartLabel: { color: "#64748B", fontSize: 9, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 11, borderTopWidth: 1, borderTopColor: "#E2E8F0" },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: "#0F172A", fontSize: 14, fontWeight: "900" },
  rowMeta: { color: "#64748B", fontSize: 12, lineHeight: 17, fontWeight: "800", marginTop: 2 },
  alertIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" },
  collectionIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" },
  whatsappBtn: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#DCFCE7" },
  openBtn: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#DBEAFE" },
  collectionAmount: { color: "#10B981", fontSize: 13, fontWeight: "900" },
  empty: { color: "#64748B", fontSize: 13, lineHeight: 19, fontWeight: "800" },
});
