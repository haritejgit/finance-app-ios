import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/auth-context";
import { getDashboardAnalytics, type DashboardAnalytics } from "../src/finance-analytics";
import { getGradient } from "../src/theme";
import { useTheme } from "../src/theme-context";
import { formatAmountInKM } from "../src/utils";
import Icon from "../src/Icon";

function formatMoney(value: number) {
  return `Rs.${Math.round(value || 0).toLocaleString("en-IN")}`;
}

function Metric({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: string;
  tone: "blue" | "green" | "orange" | "red";
}) {
  const { colors } = useTheme();
  const accent = tone === "green" ? colors.success : tone === "orange" ? colors.coral : tone === "red" ? colors.error : colors.primary;
  const soft = tone === "green" ? colors.successSoft : tone === "orange" ? colors.warningSoft : tone === "red" ? colors.destructiveSoft : colors.primarySoft;
  return (
    <View style={[styles.metric, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.metricIcon, { backgroundColor: soft }]}>
        <Icon name={icon} size={18} color={accent} />
      </View>
      <Text style={[styles.metricValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {value}
      </Text>
      <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function TrendChart({ analytics }: { analytics: DashboardAnalytics }) {
  const { colors } = useTheme();
  const maxValue = Math.max(...analytics.weeklyTrend.map((item) => Math.max(item.collection, item.distribution)), 1);
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Weekly Money Movement</Text>
          <Text style={[styles.cardSub, { color: colors.textSecondary }]}>Collections, distributions, and due marks</Text>
        </View>
        <View style={styles.legend}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.legendLabel, { color: colors.textMuted }]}>Collected</Text>
          <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
          <Text style={[styles.legendLabel, { color: colors.textMuted }]}>Distributed</Text>
        </View>
      </View>
      <View style={styles.chart}>
        {analytics.weeklyTrend.map((week) => (
          <View key={week.label} style={styles.chartColumn}>
            <View style={styles.chartBarWrap}>
              <View style={[styles.chartBar, { height: Math.max(5, (week.distribution / maxValue) * 138), backgroundColor: colors.warning }]} />
              <View style={[styles.chartBar, styles.chartBarWide, { height: Math.max(5, (week.collection / maxValue) * 154), backgroundColor: colors.primary }]} />
            </View>
            <Text style={[styles.chartAmount, { color: colors.textSecondary }]}>{formatAmountInKM(week.collection, 0)}</Text>
            <Text style={[styles.chartLabel, { color: colors.textMuted }]}>{week.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function GraphScreen() {
  const { user, loading: authLoading } = useAuth();
  const { colors } = useTheme();
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showLoader = true) => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (showLoader) setLoading(true);
    try {
      setAnalytics(await getDashboardAnalytics(user.uid));
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

  const netPosition = useMemo(() => {
    if (!analytics) return 0;
    return analytics.totals.totalCollection - analytics.totals.pendingAmount;
  }, [analytics]);

  const recoveryRate = useMemo(() => {
    if (!analytics || analytics.totals.distributedThisMonth <= 0) return 0;
    return (analytics.totals.monthlyRevenue / analytics.totals.distributedThisMonth) * 100;
  }, [analytics]);

  if (loading && !analytics) {
    return (
      <LinearGradient colors={[...getGradient(colors)]} style={styles.root}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.white} />
            <Text style={[styles.loadingText, { color: colors.white }]}>Loading business intelligence...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[...getGradient(colors)]} style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(false); }} tintColor={colors.white} />}
        >
          <View style={styles.content}>
            <View style={[styles.hero, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
              <Pressable style={[styles.backBtn, { backgroundColor: colors.primarySoft }]} onPress={() => router.back()}>
                <Icon name="arrow-back" size={18} color={colors.primary} />
              </Pressable>
              <View style={styles.heroCopy}>
                <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>Business progress</Text>
                <Text style={[styles.title, { color: colors.text }]}>Analytics Command Center</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Cash flow, recovery quality, and route discipline in one view.</Text>
              </View>
              <View style={[styles.netPill, { backgroundColor: netPosition >= 0 ? colors.successSoft : colors.destructiveSoft }]}>
                <Icon name={netPosition >= 0 ? "trending-up" : "trending-down"} size={18} color={netPosition >= 0 ? colors.success : colors.error} />
                <Text style={[styles.netPillText, { color: netPosition >= 0 ? colors.success : colors.error }]}>
                  {formatAmountInKM(netPosition, 1)}
                </Text>
              </View>
            </View>

            {analytics && (
              <>
                <View style={styles.metrics}>
                  <Metric label="Total collection" value={formatAmountInKM(analytics.totals.totalCollection, 1)} icon="cash-outline" tone="green" />
                  <Metric label="Pending amount" value={formatAmountInKM(analytics.totals.pendingAmount, 1)} icon="alert-circle-outline" tone="red" />
                  <Metric label="Monthly recovery" value={`${recoveryRate.toFixed(0)}%`} icon="analytics-outline" tone="blue" />
                  <Metric label="Active loans" value={`${analytics.totals.activeLoanCount}`} icon="wallet-outline" tone="orange" />
                </View>

                <TrendChart analytics={analytics} />

                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Financial Insights</Text>
                  {analytics.insights.concat(analytics.aiInsights).map((insight) => (
                    <View key={insight} style={styles.insightRow}>
                      <View style={[styles.insightDot, { backgroundColor: colors.primary }]} />
                      <Text style={[styles.insightText, { color: colors.textSecondary }]}>{insight}</Text>
                    </View>
                  ))}
                </View>

                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.cardHeader}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>Risk Queue</Text>
                    <Text style={[styles.cardSub, { color: colors.textSecondary }]}>{analytics.dueAlerts.length} active follow-ups</Text>
                  </View>
                  {analytics.dueAlerts.length ? (
                    analytics.dueAlerts.map((alert) => (
                      <Pressable key={alert.customerId} style={[styles.riskRow, { borderTopColor: colors.border }]} onPress={() => router.push(`/profile/${alert.customerId}`)}>
                        <View style={styles.riskCopy}>
                          <Text style={[styles.riskName, { color: colors.text }]}>{alert.customerName}</Text>
                          <Text style={[styles.riskMeta, { color: colors.textSecondary }]}>
                            {alert.villageName} | {alert.dueCount} dues | {formatMoney(alert.balanceAmount)}
                          </Text>
                        </View>
                        <Icon name="arrow-forward" size={16} color={colors.textMuted} />
                      </Pressable>
                    ))
                  ) : (
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>No high-risk active loans right now.</Text>
                  )}
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const screenWidth = Dimensions.get("window").width;

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  container: { padding: 16, paddingBottom: 34 },
  content: { width: "100%", maxWidth: Math.min(screenWidth - 32, 1120), alignSelf: "center", gap: 14 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 15, fontWeight: "800" },
  hero: { borderRadius: 24, borderWidth: 1, padding: 16, gap: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  heroCopy: { gap: 3 },
  eyebrow: { fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  title: { fontSize: 30, fontWeight: "900" },
  subtitle: { fontSize: 13, lineHeight: 19, fontWeight: "700" },
  netPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  netPillText: { fontSize: 13, fontWeight: "900" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { flexGrow: 1, flexBasis: "47%", minWidth: 156, borderWidth: 1, borderRadius: 18, padding: 14 },
  metricIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  metricValue: { fontSize: 23, fontWeight: "900" },
  metricLabel: { fontSize: 11, fontWeight: "900", marginTop: 4, textTransform: "uppercase" },
  card: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 12 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  cardTitle: { fontSize: 18, fontWeight: "900" },
  cardSub: { fontSize: 11, fontWeight: "800" },
  legend: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap", justifyContent: "flex-end", flex: 1 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 10, fontWeight: "900" },
  chart: { height: 190, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 7 },
  chartColumn: { flex: 1, alignItems: "center", gap: 5 },
  chartBarWrap: { height: 160, flexDirection: "row", alignItems: "flex-end", gap: 3 },
  chartBar: { width: 10, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  chartBarWide: { width: 14 },
  chartAmount: { fontSize: 9, fontWeight: "900" },
  chartLabel: { fontSize: 9, fontWeight: "800" },
  insightRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  insightDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  insightText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  riskRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderTopWidth: 1 },
  riskCopy: { flex: 1 },
  riskName: { fontSize: 14, fontWeight: "900" },
  riskMeta: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  empty: { fontSize: 13, fontWeight: "800" },
});
