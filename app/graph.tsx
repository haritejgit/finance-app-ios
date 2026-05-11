import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { useAuth } from "../src/auth-context";
import { colors, gradient } from "../src/theme";
import Icon from "../src/Icon";
import { SafeAreaView } from "react-native-safe-area-context";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../src/firebase";
import { formatAmountInKM } from "../src/utils";

const screenWidth = Dimensions.get("window").width;
const BUSINESS_START_DATE = new Date(2026, 3, 1).getTime();

function getNetDistributedAmount(amount: number) {
  return amount - Math.floor(amount / 1000) * 20;
}

export default function GraphScreen() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [monthlyData, setMonthlyData] = useState({
    collections: [0, 0, 0, 0, 0, 0],
    distributions: [0, 0, 0, 0, 0, 0],
    labels: [] as string[],
  });
  const [stats, setStats] = useState({
    totalCollection: 0,
    totalDistributed: 0,
    totalCustomers: 0,
    totalLoans: 0,
    growthRate: 0,
  });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Wait for Firebase Auth to resolve before fetching
    if (authLoading) return;
    fetchGraphData();
  }, [user, authLoading]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchGraphData().then(() => setRefreshing(false));
  }, [user]);

  const fetchGraphData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (!refreshing) setLoading(true);

    try {
      // Get business months from April 2026 onward.
      const now = new Date();
      const months = [];
      const cursor = new Date(BUSINESS_START_DATE);
      cursor.setDate(1);
      const endMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      while (cursor <= endMonth) {
        const d = new Date(cursor);
        months.push({
          start: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
          end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime(),
          label: d.toLocaleDateString("en-US", { month: "short" }),
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }

      // Fetch payments
      const paymentsQuery = query(
        collection(db, "payments"),
        where("userId", "==", user.uid)
      );
      const paymentsSnap = await getDocs(paymentsQuery);
      const payments = paymentsSnap.docs.map((d) => d.data() as any);

      // Fetch loans
      const loansQuery = query(
        collection(db, "loans"),
        where("userId", "==", user.uid)
      );
      const loansSnap = await getDocs(loansQuery);
      const loans = loansSnap.docs.map((d) => d.data() as any);

      // Fetch customers
      const customersQuery = query(
        collection(db, "customers"),
        where("userId", "==", user.uid)
      );
      const customersSnap = await getDocs(customersQuery);
      const customers = customersSnap.docs.map((d) => d.data() as any);

      // Calculate monthly collections and distributions
      const collections = months.map((month) => {
        return payments
          .filter((p) => {
            const date = p.paymentDate?.toMillis ? p.paymentDate.toMillis() : p.paymentDate;
            return date >= BUSINESS_START_DATE && date >= month.start && date <= month.end && p.paymentType !== "DUE";
          })
          .reduce((sum, p) => sum + (p.amountPaid || 0), 0);
      });

      const distributions = months.map((month) => {
        const rawDistributed = loans
          .filter((loan) => {
            const date = loan.startDate?.toMillis ? loan.startDate.toMillis() : loan.startDate;
            return date >= BUSINESS_START_DATE && date >= month.start && date <= month.end;
          })
          .reduce((sum, loan) => sum + (loan.principalAmount || 0), 0);
        return getNetDistributedAmount(rawDistributed);
      });

      // Calculate totals
      const totalCollection = collections.reduce((a, b) => a + b, 0);
      const totalDistributed = distributions.reduce((a, b) => a + b, 0);

      // Calculate growth rate (compare last month to first month)
      const growthRate = collections[0] > 0
        ? ((collections[collections.length - 1] - collections[0]) / collections[0]) * 100
        : 0;

      setMonthlyData({ collections, distributions, labels: months.map((month) => month.label) });
      setStats({
        totalCollection,
        totalDistributed,
        totalCustomers: customers.length,
        totalLoans: loans.length,
        growthRate,
      });
    } catch (error) {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  };

  const maxCollection = Math.max(...monthlyData.collections, 1);
  const maxDistribution = Math.max(...monthlyData.distributions, 1);

  if (loading) {
    return (
      <LinearGradient colors={[...gradient]} style={styles.root}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.white} />
            <Text style={styles.loadingText}>Loading business insights...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[...gradient]} style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <ScrollView 
          contentContainerStyle={styles.container}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.white} />
          }
        >
          <View style={styles.content}>
            <View style={styles.heroCard}>
              <View style={styles.heroTop}>
                <View style={styles.heroIcon}>
                  <Icon name="analytics-outline" size={24} color={colors.white} />
                </View>
                <View style={styles.heroCopy}>
                  <Text style={styles.eyebrow}>Business Progress</Text>
                  <Text style={styles.header}>Money movement</Text>
                </View>
              </View>
              <View style={styles.heroMetricRow}>
                <View>
                  <Text style={styles.heroMetricLabel}>Net position</Text>
                  <Text style={[
                    styles.heroMetricValue,
                    stats.totalCollection >= stats.totalDistributed ? styles.heroPositive : styles.heroNegative,
                  ]}>
                    {formatAmountInKM(stats.totalCollection - stats.totalDistributed, 1)}
                  </Text>
                </View>
                <View style={styles.heroPill}>
                  <Icon name={stats.growthRate >= 0 ? "trending-up" : "trending-down"} size={18} color={stats.growthRate >= 0 ? colors.teal : colors.coral} />
                  <Text style={styles.heroPillText}>{Math.abs(stats.growthRate).toFixed(1)}%</Text>
                </View>
              </View>
            </View>

            {/* Stats Cards */}
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <View style={[styles.statIcon, styles.statIconGreen]}>
                  <Icon name="cash-outline" size={18} color={colors.teal} />
                </View>
                <Text style={styles.statAmount}>{formatAmountInKM(stats.totalCollection, 1)}</Text>
                <Text style={styles.statLabel}>Total Collection</Text>
              </View>
              <View style={styles.statCard}>
                <View style={[styles.statIcon, styles.statIconOrange]}>
                  <Icon name="trending-up-outline" size={18} color={colors.coral} />
                </View>
                <Text style={styles.statAmount}>{formatAmountInKM(stats.totalDistributed, 1)}</Text>
                <Text style={styles.statLabel}>Net Distributed</Text>
              </View>
              <View style={styles.statCard}>
                <View style={[styles.statIcon, styles.statIconBlue]}>
                  <Icon name="people" size={18} color={colors.blue2} />
                </View>
                <Text style={styles.statNumber}>{stats.totalCustomers}</Text>
                <Text style={styles.statLabel}>Customers</Text>
              </View>
              <View style={styles.statCard}>
                <View style={[styles.statIcon, styles.statIconPurple]}>
                  <Icon name="wallet-outline" size={18} color="#7c3aed" />
                </View>
                <Text style={styles.statNumber}>{stats.totalLoans}</Text>
                <Text style={styles.statLabel}>Active Loans</Text>
              </View>
            </View>

            {/* Charts */}
            <View style={styles.chartsSection}>
              <Text style={styles.sectionTitle}>Monthly Trends</Text>

              {/* Collection Bar Chart */}
              <View style={styles.chartCard}>
                <View style={styles.chartTitleRow}>
                  <Text style={styles.chartTitle}>Collections</Text>
                  <Text style={styles.chartTotal}>{formatAmountInKM(stats.totalCollection, 1)}</Text>
                </View>
                <View style={styles.barsRow}>
                  {monthlyData.collections.map((value, index) => {
                    const height = maxCollection > 0 ? (value / maxCollection) * 120 : 0;
                    return (
                      <View key={index} style={styles.barColumn}>
                        <View style={[styles.barVisual, { height: Math.max(height, 4) }]} />
                        <Text style={styles.barLabel}>{monthlyData.labels[index]}</Text>
                        <Text style={styles.barAmount}>{formatAmountInKM(value, 0)}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Distribution Bar Chart */}
              <View style={styles.chartCard}>
                <View style={styles.chartTitleRow}>
                  <Text style={styles.chartTitle}>Net Distributions</Text>
                  <Text style={styles.chartTotal}>{formatAmountInKM(stats.totalDistributed, 1)}</Text>
                </View>
                <Text style={styles.deductionNote}>After Rs.20 reduction for every Rs.1000 distributed</Text>
                <View style={styles.barsRow}>
                  {monthlyData.distributions.map((value, index) => {
                    const height = maxDistribution > 0 ? (value / maxDistribution) * 120 : 0;
                    return (
                      <View key={index} style={styles.barColumn}>
                        <View style={[styles.barVisual, styles.barVisualOrange, { height: Math.max(height, 4) }]} />
                        <Text style={styles.barLabel}>{monthlyData.labels[index]}</Text>
                        <Text style={styles.barAmount}>{formatAmountInKM(value, 0)}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Summary */}
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Business Summary</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Net Position:</Text>
                  <Text style={[styles.summaryValue, stats.totalCollection >= stats.totalDistributed ? styles.positive : styles.negative]}>
                    {formatAmountInKM((stats.totalCollection - stats.totalDistributed), 1)}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Collection vs Distribution:</Text>
                  <Text style={styles.summaryValue}>
                    {stats.totalDistributed > 0
                      ? ((stats.totalCollection / stats.totalDistributed) * 100).toFixed(0)
                      : 0}%
                  </Text>
                </View>
              </View>
            </View>

            {/* Back Button */}
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>← Back to Dashboard</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  container: { paddingHorizontal: 16, paddingVertical: 16 },
  content: { width: "100%", maxWidth: Math.min(screenWidth - 32, 430), alignSelf: "center", gap: 16 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { color: colors.white, marginTop: 12, fontSize: 16 },
  heroCard: { backgroundColor: "rgba(255,255,255,0.16)", borderWidth: 1, borderColor: "rgba(255,255,255,0.24)", borderRadius: 22, padding: 18, gap: 20 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1 },
  eyebrow: { color: "rgba(255,255,255,0.76)", fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  header: { color: colors.white, fontSize: 27, fontWeight: "900" },
  heroMetricRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  heroMetricLabel: { color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  heroMetricValue: { fontSize: 34, fontWeight: "900", marginTop: 3 },
  heroPositive: { color: "#bbf7d0" },
  heroNegative: { color: "#fed7aa" },
  heroPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  heroPillText: { color: colors.ink, fontSize: 13, fontWeight: "900" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    alignItems: "flex-start",
  },
  statIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  statIconGreen: { backgroundColor: colors.mint },
  statIconOrange: { backgroundColor: "#fff0df" },
  statIconBlue: { backgroundColor: "#eaf2ff" },
  statIconPurple: { backgroundColor: "#ede9fe" },
  statAmount: { color: colors.ink, fontSize: 20, fontWeight: "900" },
  statNumber: { color: colors.ink, fontSize: 24, fontWeight: "900" },
  statLabel: { color: colors.gray, fontSize: 12, marginTop: 4, fontWeight: "800" },
  growthCard: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  growthLabel: { color: colors.white, fontSize: 16, fontWeight: "600" },
  growthValue: { fontSize: 24, fontWeight: "700" },
  growthPositive: { color: "#4CAF50" },
  growthNegative: { color: "#FF5722" },
  chartsSection: { gap: 16 },
  sectionTitle: { color: colors.white, fontSize: 18, fontWeight: "900" },
  chartCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  chartTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  chartTitle: { color: colors.blue2, fontSize: 16, fontWeight: "900" },
  chartTotal: { color: colors.ink, fontSize: 14, fontWeight: "900" },
  deductionNote: { color: colors.gray, fontSize: 11, fontWeight: "700", marginBottom: 10 },
  barsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", height: 160 },
  barColumn: { flex: 1, alignItems: "center" },
  barVisual: {
    width: 30,
    backgroundColor: colors.blue2,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  barVisualOrange: { backgroundColor: "#FF9800" },
  barLabel: { fontSize: 10, color: "#666", marginTop: 8 },
  barAmount: { fontSize: 10, color: colors.blue2, fontWeight: "600" },
  chartContainer: { marginBottom: 20 },
  chartLabel: { color: colors.blue2, fontSize: 14, fontWeight: "600", marginBottom: 10 },
  barsContainer: { flexDirection: "row", justifyContent: "space-around", alignItems: "flex-end", height: 180 },
  barWrapper: { alignItems: "center", flex: 1 },
  bar: {
    width: 40,
    backgroundColor: colors.blue2,
    borderRadius: 4,
    marginBottom: 5,
  },
  barValue: { fontSize: 10, color: "#666" },
  lineChartContainer: { height: 180, position: "relative" },
  lineChartBackground: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e0e0e0",
  },
  dataPoint: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.blue2,
    marginLeft: -4,
    marginBottom: -4,
  },
  lineChartLabels: { flexDirection: "row", justifyContent: "space-around", marginTop: 10 },
  lineValue: { fontSize: 10, color: "#666" },
  summaryCard: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 16,
    padding: 20,
  },
  summaryTitle: { color: colors.blue2, fontSize: 16, fontWeight: "700", marginBottom: 12 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  summaryLabel: { color: "#666", fontSize: 14 },
  summaryValue: { fontSize: 14, fontWeight: "700" },
  positive: { color: "#4CAF50" },
  negative: { color: "#FF5722" },
  backBtn: {
    backgroundColor: colors.white,
    borderRadius: 28,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  backBtnText: { color: colors.blue3, fontWeight: "700" },
});
