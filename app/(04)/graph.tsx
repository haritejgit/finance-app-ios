import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  getDashboardAnalytics,
  subscribeDashboardAnalytics,
  type DashboardAnalytics,
  type MonthlyTrendPoint,
  type ExpenseBreakdownItem,
  type PredictionItem,
} from "../../src/finance-analytics";
import Icon from "../../src/Icon";
import { getWeeklyChartData, type WeeklyChartPoint } from "../../src/repository";
import { formatAmountInKM } from "../../src/utils";
import { Gradients, Colors } from "../../src/theme";

function formatMoney(value: number) {
  return `Rs.${Math.round(value || 0).toLocaleString("en-IN")}`;
}

function formatIndianCurrency(value: number) {
  return `Rs.${Math.round(value || 0).toLocaleString("en-IN")}`;
}

function formatCompact(value: number) {
  if (Math.abs(value) >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return Math.round(value).toLocaleString("en-IN");
}

// ——— Reusable Card Components ———

function LifetimeCard({ label, value, sub, icon, tone }: {
  label: string; value: string; sub: string; icon: string; tone: string;
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

function MetricCard({ label, value, sub, icon, tone }: {
  label: string; value: string; sub: string; icon: string; tone: string;
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

function Section({ title, subtitle, action, children }: {
  title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode;
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
  const palette = [Colors.lightSeaGreen, Colors.amberGlow, Colors.honeyBronze, Colors.danger, "#6366f1"];
  const icons = ["sparkles-outline", "analytics-outline", "alert-circle-outline", "trending-up", "bulb-outline"];
  const tone = palette[index % palette.length];
  return (
    <View style={styles.insightCard}>
      <View style={[styles.insightIcon, { backgroundColor: `${tone}18` }]}>
        <Icon name={icons[index % icons.length]} size={18} color={tone} />
      </View>
      <View style={styles.insightCopy}>
        <Text style={styles.insightTitle}>Insight {index + 1}</Text>
        <Text style={styles.insightText}>{insight}</Text>
      </View>
    </View>
  );
}

// ——— Chart Components ———

function MonthlyTrendChart({ data }: { data: MonthlyTrendPoint[] }) {
  const maxValue = Math.max(
    ...data.map((m) => Math.max(m.collected, m.distributed, m.invested, m.expenses)),
    1
  );
  const barColors = {
    collected: Colors.lightSeaGreen,
    distributed: Colors.amberGlow,
    invested: "#6366f1",
    expenses: Colors.danger,
  };

  return (
    <View>
      <View style={styles.chart}>
        {data.map((month, idx) => (
          <View key={`${month.label}-${idx}`} style={styles.chartColumn}>
            <View style={[styles.chartBarWrap, { gap: 2 }]}>
              <View style={[styles.chartBar, { backgroundColor: barColors.collected, height: Math.max(4, (month.collected / maxValue) * 130) }]} />
              <View style={[styles.chartBar, { backgroundColor: barColors.distributed, height: Math.max(4, (month.distributed / maxValue) * 130) }]} />
              {month.invested > 0 && (
                <View style={[styles.chartBar, { backgroundColor: barColors.invested, height: Math.max(4, (month.invested / maxValue) * 130) }]} />
              )}
              {month.expenses > 0 && (
                <View style={[styles.chartBar, { backgroundColor: barColors.expenses, height: Math.max(4, (month.expenses / maxValue) * 130) }]} />
              )}
            </View>
            <Text style={styles.chartAmount}>{formatCompact(month.collected)}</Text>
            <Text style={styles.chartLabel}>{month.label}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.legend, { marginTop: 10, justifyContent: "center" }]}>
        <View style={[styles.legendDot, { backgroundColor: barColors.collected }]} />
        <Text style={styles.legendText}>Collected</Text>
        <View style={[styles.legendDot, { backgroundColor: barColors.distributed }]} />
        <Text style={styles.legendText}>Distributed</Text>
        <View style={[styles.legendDot, { backgroundColor: barColors.invested }]} />
        <Text style={styles.legendText}>Invested</Text>
        <View style={[styles.legendDot, { backgroundColor: barColors.expenses }]} />
        <Text style={styles.legendText}>Expenses</Text>
      </View>
    </View>
  );
}

function ExpenseBreakdownChart({ data }: { data: ExpenseBreakdownItem[] }) {
  const maxAmount = Math.max(...data.map((d) => d.amount), 1);
  const barColors = ["#d94841", "#ff6b6b", "#ff8787", "#ffa8a8", "#ffc9c9", "#ffe0e0", "#ffebeb", "#fff5f5"];

  return (
    <View style={{ gap: 8 }}>
      {data.map((item, idx) => (
        <View key={item.description} style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: Colors.nearBlack, fontSize: 12, fontWeight: "800", flex: 1 }} numberOfLines={1}>
              {item.description}
            </Text>
            <Text style={{ color: Colors.danger, fontSize: 12, fontWeight: "900" }}>
              Rs.{Math.round(item.amount).toLocaleString("en-IN")}
            </Text>
          </View>
          <View style={{ height: 8, backgroundColor: "#fde7e5", borderRadius: 4, overflow: "hidden" }}>
            <View
              style={{
                height: 8,
                width: `${Math.max(3, (item.amount / maxAmount) * 100)}%`,
                backgroundColor: barColors[idx % barColors.length],
                borderRadius: 4,
              }}
            />
          </View>
          <Text style={{ color: Colors.textMuted, fontSize: 10, fontWeight: "700" }}>
            {item.percentage.toFixed(1)}% of total
          </Text>
        </View>
      ))}
    </View>
  );
}

function PredictionCard({ prediction, index }: { prediction: PredictionItem; index: number }) {
  const isPositive = prediction.netCash >= 0;
  return (
    <View style={styles.predictionCard}>
      <View style={styles.predictionHeader}>
        <Text style={styles.predictionMonth}>{prediction.label}</Text>
        <View style={[styles.confidencePill, { backgroundColor: prediction.confidence >= 60 ? "#dcfce7" : prediction.confidence >= 35 ? "#fef3c7" : "#fee2e2" }]}>
          <Text style={[styles.confidenceText, { color: prediction.confidence >= 60 ? "#15803d" : prediction.confidence >= 35 ? "#a16207" : "#b91c1c" }]}>
            {prediction.confidence}% confidence
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 10, fontWeight: "800", color: Colors.textMuted, textTransform: "uppercase" }}>Collection</Text>
          <Text style={{ fontSize: 15, fontWeight: "900", color: Colors.lightSeaGreen, marginTop: 2 }}>
            {formatCompact(prediction.collection)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 10, fontWeight: "800", color: Colors.textMuted, textTransform: "uppercase" }}>Expenses</Text>
          <Text style={{ fontSize: 15, fontWeight: "900", color: Colors.danger, marginTop: 2 }}>
            {formatCompact(prediction.expenses)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 10, fontWeight: "800", color: Colors.textMuted, textTransform: "uppercase" }}>Net Cash</Text>
          <Text style={{ fontSize: 15, fontWeight: "900", color: isPositive ? Colors.lightSeaGreen : Colors.danger, marginTop: 2 }}>
            {isPositive ? "" : "-"}{formatCompact(Math.abs(prediction.netCash))}
          </Text>
        </View>
      </View>
    </View>
  );
}

function TrendChart({ data }: { data: WeeklyChartPoint[] }) {
  const maxValue = Math.max(...data.map((item) => Math.max(item.collected, item.distributed)), 1);

  return (
    <View style={styles.chart}>
      {data.map((week) => (
        <View key={week.weekLabel} style={styles.chartColumn}>
          <View style={styles.chartBarWrap}>
            <View style={[styles.chartBar, styles.outBar, { height: Math.max(7, (week.distributed / maxValue) * 134) }]} />
            <View style={[styles.chartBar, styles.inBar, { height: Math.max(7, (week.collected / maxValue) * 148) }]} />
          </View>
          <Text style={styles.chartAmount}>{formatAmountInKM(week.collected, 0)}</Text>
          <Text style={styles.chartLabel}>{week.weekLabel}</Text>
        </View>
      ))}
    </View>
  );
}

// ——— Cash Position Hero ———
function CashPositionCard({
  netCash,
  bf,
  monthlyInvested,
  monthlyExpenses,
  monthlyCollection,
  monthlyDistributed,
}: {
  netCash: number;
  bf: number;
  monthlyInvested: number;
  monthlyExpenses: number;
  monthlyCollection: number;
  monthlyDistributed: number;
}) {
  const isPositive = netCash >= 0;
  const monthlyNetFlow = monthlyCollection + monthlyInvested - monthlyDistributed - monthlyExpenses;
  const flowPositive = monthlyNetFlow >= 0;

  return (
    <View style={styles.cashPositionCard}>
      <View style={styles.cashHeader}>
        <View style={[styles.cashIcon, { backgroundColor: isPositive ? "#dcfce7" : "#fee2e2" }]}>
          <Icon name={isPositive ? "trending-up" : "trending-down"} size={22} color={isPositive ? "#15803d" : "#b91c1c"} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cashLabel}>Net Cash Position</Text>
          <Text style={[styles.cashValue, { color: isPositive ? "#15803d" : "#b91c1c" }]}>
            {isPositive ? "" : "-"}Rs.{Math.round(Math.abs(netCash)).toLocaleString("en-IN")}
          </Text>
        </View>
      </View>
      <View style={styles.cashDivider} />
      <View style={styles.cashFlow}>
        <View style={styles.cashFlowItem}>
          <Text style={styles.cashFlowLabel}>BF</Text>
          <Text style={styles.cashFlowValue}>{formatCompact(bf)}</Text>
        </View>
        <View style={styles.cashFlowItem}>
          <Text style={styles.cashFlowLabel}>This Month</Text>
          <Text style={[styles.cashFlowValue, { color: flowPositive ? Colors.lightSeaGreen : Colors.danger }]}>
            {flowPositive ? "+" : ""}{formatCompact(monthlyNetFlow)}
          </Text>
        </View>
        <View style={styles.cashFlowItem}>
          <Text style={styles.cashFlowLabel}>Invested</Text>
          <Text style={[styles.cashFlowValue, { color: "#6366f1" }]}>{formatCompact(monthlyInvested)}</Text>
        </View>
        <View style={styles.cashFlowItem}>
          <Text style={styles.cashFlowLabel}>Expenses</Text>
          <Text style={[styles.cashFlowValue, { color: Colors.danger }]}>{formatCompact(monthlyExpenses)}</Text>
        </View>
      </View>
    </View>
  );
}

// ——— Main Screen ———

export default function GraphScreen() {
  const { user, loading: authLoading } = useAuth();
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [weeklyChartData, setWeeklyChartData] = useState<WeeklyChartPoint[]>([]);
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
      const [nextAnalytics, nextWeeklyChartData] = await Promise.all([
        getDashboardAnalytics(user.uid),
        getWeeklyChartData(user.uid),
      ]);
      setAnalytics(nextAnalytics);
      setWeeklyChartData(nextWeeklyChartData);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return undefined;
    if (!user) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    const hydrateWeekly = async () => {
      const nextWeeklyChartData = await getWeeklyChartData(user.uid);
      if (!cancelled) {
        setWeeklyChartData(nextWeeklyChartData);
        setLoading(false);
      }
    };
    const unsub = subscribeDashboardAnalytics(
      user.uid,
      (nextAnalytics) => {
        setAnalytics(nextAnalytics);
        hydrateWeekly().catch(() => setLoading(false));
      },
      () => {
        load(false);
      }
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [authLoading, load, user]);

  const recoveryRate = useMemo(() => {
    if (!analytics || analytics.totals.distributedThisMonth <= 0) return 0;
    return (analytics.totals.monthlyRevenue / analytics.totals.distributedThisMonth) * 100;
  }, [analytics]);

  const netPosition = useMemo(() => {
    if (!analytics) return 0;
    return analytics.totals.totalCollection - analytics.totals.pendingAmount;
  }, [analytics]);

  const lifetimeNet = useMemo(() => {
    if (!analytics) return 0;
    return analytics.totals.totalCollection - analytics.totals.totalDistributed
      + analytics.totals.totalInvestments - analytics.totals.totalExpenses;
  }, [analytics]);

  const insightList = analytics ? analytics.insights.concat(analytics.aiInsights).slice(0, 7) : [];

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

  if (!user) return null;

  if (loading && !analytics) {
    return (
      <AnimatedScreen style={styles.root}>
        <LinearGradient colors={Gradients.screenBg} style={styles.root}>
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
        <LinearGradient colors={Gradients.screenBg} style={styles.root}>
        <SafeAreaView style={styles.safe}>
          <ScrollView
            contentContainerStyle={styles.container}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(false); }} tintColor="#FFFFFF" />}
          >
            <View style={styles.content}>
              <View style={styles.hero}>
                <Pressable accessibilityLabel="Go back" style={styles.backBtn} onPress={() => router.back()}>
                  <Icon name="arrow-back" size={19} color={Colors.nearBlack} />
                </Pressable>
                <View style={styles.heroCopy}>
                  <Text style={styles.eyebrow}>Business intelligence</Text>
                  <Text style={styles.title}>Analytics Center</Text>
                  <Text style={styles.subtitle}>Real-time financials, trends, and predictions</Text>
                </View>
                <View style={[styles.netPill, netPosition >= 0 ? styles.netPillGood : styles.netPillRisk]}>
                  <Icon name={netPosition >= 0 ? "trending-up" : "trending-down"} size={17} color={netPosition >= 0 ? Colors.lightSeaGreen : Colors.danger} />
                  <Text style={[styles.netPillText, { color: netPosition >= 0 ? Colors.lightSeaGreen : Colors.danger }]}>
                    {formatMoney(netPosition)}
                  </Text>
                </View>
              </View>

              {/* Cash Position Hero Card */}
              {analytics && (
                <CashPositionCard
                  netCash={analytics.totals.netCashPosition}
                  bf={analytics.totals.balancingFund}
                  monthlyInvested={analytics.totals.monthlyInvestments}
                  monthlyExpenses={analytics.totals.monthlyExpenses}
                  monthlyCollection={analytics.totals.monthlyRevenue}
                  monthlyDistributed={analytics.totals.distributedThisMonth}
                />
              )}

              {/* Lifetime Grid — 5 cards: Distributed, Collected, Invested, Expenses, Net */}
              <View style={styles.lifetimeGrid}>
                <LifetimeCard
                  label="Total Distributed"
                  value={formatIndianCurrency(analytics?.totals.totalDistributed ?? 0)}
                  sub="Since business started"
                  icon="arrow-up-outline"
                  tone={Colors.amberGlow}
                />
                <LifetimeCard
                  label="Total Collected"
                  value={formatIndianCurrency(analytics?.totals.totalCollection ?? 0)}
                  sub="Since business started"
                  icon="arrow-down"
                  tone={Colors.lightSeaGreen}
                />
                <LifetimeCard
                  label="Total Invested"
                  value={formatIndianCurrency(analytics?.totals.totalInvestments ?? 0)}
                  sub="Capital additions"
                  icon="cash-outline"
                  tone="#6366f1"
                />
                <LifetimeCard
                  label="Total Expenses"
                  value={formatIndianCurrency(analytics?.totals.totalExpenses ?? 0)}
                  sub="Operational costs"
                  icon="receipt-outline"
                  tone={Colors.danger}
                />
                <LifetimeCard
                  label="Lifetime Net"
                  value={formatIndianCurrency(lifetimeNet)}
                  sub="All income minus all outflow"
                  icon={lifetimeNet >= 0 ? "trending-up" : "trending-down"}
                  tone={lifetimeNet >= 0 ? Colors.lightSeaGreen : Colors.danger}
                />
              </View>

              {analytics ? (
                <>
                  {/* Monthly Metrics Grid */}
                  <View style={styles.metricGrid}>
                    <MetricCard label="This Month" value={formatMoney(analytics.totals.monthlyRevenue)} sub="Collected revenue" icon="cash-outline" tone={Colors.lightSeaGreen} />
                    <MetricCard label="Distributed" value={formatMoney(analytics.totals.distributedThisMonth)} sub="Fresh money this month" icon="wallet-outline" tone={Colors.amberGlow} />
                    <MetricCard label="Recovery Rate" value={`${recoveryRate.toFixed(0)}%`} sub="Collected vs distributed" icon="analytics-outline" tone={Colors.honeyBronze} />
                    <MetricCard label="Active Loans" value={`${analytics.totals.activeLoanCount}`} sub={`${analytics.totals.customerCount} customers`} icon="people-outline" tone={Colors.lightSeaGreen} />
                    <MetricCard label="Monthly Invested" value={formatMoney(analytics.totals.monthlyInvestments)} sub="Capital this month" icon="trending-up" tone="#6366f1" />
                    <MetricCard label="Monthly Expenses" value={formatMoney(analytics.totals.monthlyExpenses)} sub="Costs this month" icon="receipt-outline" tone={Colors.danger} />
                  </View>

                  {/* 6-Month Trend Chart */}
                  <Section
                    title="6-Month Trend"
                    subtitle="Collections, distributions, investments & expenses"
                  >
                    {analytics.monthlyTrend.length > 0 ? (
                      <MonthlyTrendChart data={analytics.monthlyTrend} />
                    ) : (
                      <Text style={styles.empty}>No monthly data available yet.</Text>
                    )}
                  </Section>

                  {/* Expense Breakdown */}
                  {analytics.expenseBreakdown.length > 0 && (
                    <Section
                      title="Expense Breakdown"
                      subtitle="Where your money goes"
                      action={<Text style={styles.sectionBadge}>{analytics.expenseBreakdown.length} categories</Text>}
                    >
                      <ExpenseBreakdownChart data={analytics.expenseBreakdown} />
                    </Section>
                  )}

                  {/* 3-Month Predictions */}
                  {analytics.predictions.length > 0 && (
                    <Section
                      title="3-Month Forecast"
                      subtitle="Projections based on last 3 months of activity"
                      action={
                        <View style={[styles.confidencePill, { backgroundColor: "#e0f2fe" }]}>
                          <Icon name="sparkles-outline" size={12} color="#0284c7" />
                          <Text style={[styles.confidenceText, { color: "#0284c7" }]}>AI Predicted</Text>
                        </View>
                      }
                    >
                      <View style={{ gap: 10 }}>
                        {analytics.predictions.map((pred, idx) => (
                          <PredictionCard key={pred.label} prediction={pred} index={idx} />
                        ))}
                      </View>
                    </Section>
                  )}

                  {/* Business Insights */}
                  <Section
                    title="Business Insights"
                    subtitle="Generated from your transactions & financial data"
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

                  {/* Weekly Money Movement */}
                  <Section
                    title="Weekly Movement"
                    subtitle="Collections and distributions by week"
                    action={
                      <View style={styles.legend}>
                        <View style={[styles.legendDot, { backgroundColor: Colors.lightSeaGreen }]} />
                        <Text style={styles.legendText}>Collected</Text>
                        <View style={[styles.legendDot, { backgroundColor: Colors.amberGlow }]} />
                        <Text style={styles.legendText}>Distributed</Text>
                      </View>
                    }
                  >
                    {weeklyChartData.length ? (
                      <TrendChart data={weeklyChartData} />
                    ) : (
                      <Text style={styles.empty}>No data yet.</Text>
                    )}
                  </Section>

                  {/* Risk Queue */}
                  <Section
                    title="Risk Queue"
                    subtitle={`${analytics.dueAlerts.length} active follow-ups`}
                    action={<Text style={styles.sectionBadge}>{analytics.totals.dueMarksThisMonth} due marks</Text>}
                  >
                    {analytics.dueAlerts.length ? (
                      analytics.dueAlerts.map((alert) => (
                        <View key={alert.customerId} style={styles.row}>
                          <View style={styles.alertIcon}>
                            <Icon name="alert-circle-outline" size={17} color={Colors.danger} />
                          </View>
                          <View style={styles.rowCopy}>
                            <Text style={styles.rowTitle}>{alert.customerName}</Text>
                            <Text style={styles.rowMeta}>
                              {alert.villageName} | {alert.dueCount} dues | Due {formatMoney(alert.dueAmount)} | Week {formatMoney(alert.weeklyAmount)}
                            </Text>
                          </View>
                          <Pressable accessibilityLabel={`WhatsApp ${alert.customerName}`} style={styles.whatsappBtn} onPress={() => sendRiskReminder(alert)}>
                            <Icon name="logo-whatsapp" size={17} color={Colors.lightSeaGreen} />
                          </Pressable>
                          <Pressable accessibilityLabel={`Open ${alert.customerName}`} style={styles.openBtn} onPress={() => router.push(`/profile/${alert.customerId}`)}>
                            <Icon name="arrow-forward" size={16} color={Colors.lightSeaGreen} />
                          </Pressable>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.empty}>No high-risk active loans right now.</Text>
                    )}
                  </Section>

                  {/* Recent Collections */}
                  <Section title="Recent Collections" subtitle="Latest successful payments">
                    {analytics.recentTransactions.length ? (
                      analytics.recentTransactions.map((item) => (
                        <Pressable
                          key={item.id}
                          style={styles.row}
                          onPress={() => item.customerId && router.push(`/profile/${item.customerId}`)}
                        >
                          <View style={styles.collectionIcon}>
                            <Icon name={item.paymentMode === "PHONE" ? "phone-portrait-outline" : "cash-outline"} size={16} color={Colors.lightSeaGreen} />
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
  backBtn: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: Colors.frozenWater },
  heroCopy: { flex: 1 },
  eyebrow: { color: Colors.textMuted, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  title: { color: Colors.nearBlack, fontSize: 24, lineHeight: 29, fontWeight: "900" },
  subtitle: { color: Colors.textMuted, fontSize: 12, lineHeight: 18, fontWeight: "800", marginTop: 2 },
  netPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8 },
  netPillGood: { backgroundColor: Colors.frozenWater },
  netPillRisk: { backgroundColor: "#fde7e5" },
  netPillText: { fontSize: 12, fontWeight: "900" },

  // Cash Position Card
  cashPositionCard: {
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 16,
    shadowColor: "#020617",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  cashHeader: { flexDirection: "row", alignItems: "center", gap: 14 },
  cashIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  cashLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  cashValue: { fontSize: 26, lineHeight: 32, fontWeight: "900", marginTop: 2 },
  cashDivider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 12 },
  cashFlow: { flexDirection: "row", justifyContent: "space-between" },
  cashFlowItem: { alignItems: "center" },
  cashFlowLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: "800" },
  cashFlowValue: { color: Colors.nearBlack, fontSize: 14, fontWeight: "900", marginTop: 3 },

  // Lifetime Grid
  lifetimeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  lifetimeCard: {
    flexGrow: 1,
    flexBasis: "31%",
    minWidth: 150,
    minHeight: 130,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 14,
  },
  lifetimeIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  lifetimeLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  lifetimeValue: { fontSize: 20, lineHeight: 25, fontWeight: "900", marginTop: 3 },
  lifetimeSub: { color: Colors.textMuted, fontSize: 10, fontWeight: "800", marginTop: 2 },

  // Metric Grid
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 150,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  metricIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  metricCopy: { flex: 1, minWidth: 0 },
  metricLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  metricValue: { color: Colors.nearBlack, fontSize: 19, lineHeight: 24, fontWeight: "900", marginTop: 2 },
  metricSub: { color: Colors.textMuted, fontSize: 11, fontWeight: "800", marginTop: 1 },

  // Section
  section: { borderRadius: 20, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight, padding: 14, gap: 12 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  sectionCopy: { flex: 1 },
  sectionTitle: { color: Colors.nearBlack, fontSize: 19, lineHeight: 23, fontWeight: "900" },
  sectionSub: { color: Colors.textMuted, fontSize: 11, fontWeight: "800", marginTop: 2 },
  sectionBadge: { overflow: "hidden", borderRadius: 999, backgroundColor: Colors.frozenWater, color: Colors.lightSeaGreen, paddingHorizontal: 10, paddingVertical: 6, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },

  // Insights
  insightGrid: { gap: 9 },
  insightCard: { borderRadius: 16, backgroundColor: "#f6fffe", borderWidth: 1, borderColor: Colors.borderLight, padding: 12, flexDirection: "row", gap: 11 },
  insightIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  insightCopy: { flex: 1 },
  insightTitle: { color: Colors.nearBlack, fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  insightText: { color: "#426c67", fontSize: 13, lineHeight: 19, fontWeight: "800", marginTop: 3 },

  // Charts
  legend: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap", justifyContent: "flex-end", flex: 1 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: Colors.textMuted, fontSize: 10, fontWeight: "900" },
  chart: { height: 184, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 7 },
  chartColumn: { flex: 1, alignItems: "center", gap: 5 },
  chartBarWrap: { height: 150, flexDirection: "row", alignItems: "flex-end", gap: 3 },
  chartBar: { width: 10, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  inBar: { width: 13, backgroundColor: Colors.lightSeaGreen },
  outBar: { backgroundColor: Colors.amberGlow },
  chartAmount: { color: "#426c67", fontSize: 9, fontWeight: "900" },
  chartLabel: { color: Colors.textMuted, fontSize: 9, fontWeight: "800" },

  // Predictions
  predictionCard: {
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
  },
  predictionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  predictionMonth: { color: Colors.nearBlack, fontSize: 15, fontWeight: "900" },
  confidencePill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  confidenceText: { fontSize: 10, fontWeight: "800" },

  // Rows
  row: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 11, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: Colors.nearBlack, fontSize: 14, fontWeight: "900" },
  rowMeta: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, fontWeight: "800", marginTop: 2 },
  alertIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#fde7e5", alignItems: "center", justifyContent: "center" },
  collectionIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: Colors.frozenWater, alignItems: "center", justifyContent: "center" },
  whatsappBtn: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Colors.frozenWater },
  openBtn: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Colors.frozenWater },
  collectionAmount: { color: Colors.lightSeaGreen, fontSize: 13, fontWeight: "900" },
  empty: { color: Colors.textMuted, fontSize: 13, lineHeight: 19, fontWeight: "800" },
});
