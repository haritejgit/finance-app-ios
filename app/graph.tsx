import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../src/firebase";

const screenWidth = Dimensions.get("window").width;

// Simple Bar Chart Component
const BarChart = ({ data, maxValue, label }: { data: number[]; maxValue: number; label: string }) => {
  return (
    <View style={styles.chartContainer}>
      <Text style={styles.chartLabel}>{label}</Text>
      <View style={styles.barsContainer}>
        {data.map((value, index) => {
          const height = maxValue > 0 ? (value / maxValue) * 150 : 0;
          return (
            <View key={index} style={styles.barWrapper}>
              <View style={[styles.bar, { height: Math.max(height, 5) }]} />
              <Text style={styles.barValue}>Rs.{(value / 1000).toFixed(0)}k</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

// Simple Line Chart Component
const LineChart = ({ data, maxValue, label }: { data: number[]; maxValue: number; label: string }) => {
  const points = useMemo(() => {
    if (data.length === 0 || maxValue === 0) return [];
    const width = screenWidth - 80;
    const stepX = width / (data.length - 1 || 1);
    return data.map((value, index) => ({
      x: index * stepX,
      y: 150 - (value / maxValue) * 130,
      value,
    }));
  }, [data, maxValue]);

  return (
    <View style={styles.chartContainer}>
      <Text style={styles.chartLabel}>{label}</Text>
      <View style={styles.lineChartContainer}>
        <View style={styles.lineChartBackground}>
          {points.map((point, index) => (
            <View
              key={index}
              style={[
                styles.dataPoint,
                { left: point.x, bottom: 150 - point.y },
              ]}
            />
          ))}
        </View>
        <View style={styles.lineChartLabels}>
          {data.map((value, index) => (
            <Text key={index} style={styles.lineValue}>
              Rs.{(value / 1000).toFixed(0)}k
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
};

export default function GraphScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [monthlyData, setMonthlyData] = useState({
    collections: [0, 0, 0, 0, 0, 0],
    distributions: [0, 0, 0, 0, 0, 0],
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
    fetchGraphData();
  }, [user]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchGraphData().then(() => setRefreshing(false));
  }, [user]);

  const fetchGraphData = async () => {
    if (!user) return;
    if (!refreshing) setLoading(true);

    try {
      // Get last 6 months of data
      const now = new Date();
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
          start: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
          end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime(),
          label: d.toLocaleDateString("en-US", { month: "short" }),
        });
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
            return date >= month.start && date <= month.end && p.paymentType !== "DUE";
          })
          .reduce((sum, p) => sum + (p.amountPaid || 0), 0);
      });

      const distributions = months.map((month) => {
        return loans
          .filter((loan) => {
            const date = loan.startDate?.toMillis ? loan.startDate.toMillis() : loan.startDate;
            return date >= month.start && date <= month.end;
          })
          .reduce((sum, loan) => sum + (loan.principalAmount || 0), 0);
      });

      // Calculate totals
      const totalCollection = collections.reduce((a, b) => a + b, 0);
      const totalDistributed = distributions.reduce((a, b) => a + b, 0);

      // Calculate growth rate (compare last month to first month)
      const growthRate = collections[0] > 0
        ? ((collections[5] - collections[0]) / collections[0]) * 100
        : 0;

      setMonthlyData({ collections, distributions });
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

  const monthLabels = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return d.toLocaleDateString("en-US", { month: "short" });
    });
  }, []);

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
            <Text style={styles.header}>📈 Business Progress</Text>
            <Text style={styles.subtitle}>Track your financial growth</Text>

            {/* Stats Cards */}
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statAmount}>Rs.{(stats.totalCollection / 1000).toFixed(1)}k</Text>
                <Text style={styles.statLabel}>Total Collection</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statAmount}>Rs.{(stats.totalDistributed / 1000).toFixed(1)}k</Text>
                <Text style={styles.statLabel}>Total Distributed</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{stats.totalCustomers}</Text>
                <Text style={styles.statLabel}>Customers</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{stats.totalLoans}</Text>
                <Text style={styles.statLabel}>Active Loans</Text>
              </View>
            </View>

            {/* Growth Indicator */}
            <View style={styles.growthCard}>
              <Text style={styles.growthLabel}>6-Month Growth</Text>
              <Text style={[styles.growthValue, stats.growthRate >= 0 ? styles.growthPositive : styles.growthNegative]}>
                {stats.growthRate >= 0 ? "📈" : "📉"} {Math.abs(stats.growthRate).toFixed(1)}%
              </Text>
            </View>

            {/* Charts */}
            <View style={styles.chartsSection}>
              <Text style={styles.sectionTitle}>Monthly Trends</Text>

              {/* Collection Bar Chart */}
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Monthly Collections</Text>
                <View style={styles.barsRow}>
                  {monthlyData.collections.map((value, index) => {
                    const height = maxCollection > 0 ? (value / maxCollection) * 120 : 0;
                    return (
                      <View key={index} style={styles.barColumn}>
                        <View style={[styles.barVisual, { height: Math.max(height, 4) }]} />
                        <Text style={styles.barLabel}>{monthLabels[index]}</Text>
                        <Text style={styles.barAmount}>Rs.{(value / 1000).toFixed(0)}k</Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Distribution Bar Chart */}
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Monthly Distributions</Text>
                <View style={styles.barsRow}>
                  {monthlyData.distributions.map((value, index) => {
                    const height = maxDistribution > 0 ? (value / maxDistribution) * 120 : 0;
                    return (
                      <View key={index} style={styles.barColumn}>
                        <View style={[styles.barVisual, styles.barVisualOrange, { height: Math.max(height, 4) }]} />
                        <Text style={styles.barLabel}>{monthLabels[index]}</Text>
                        <Text style={styles.barAmount}>Rs.{(value / 1000).toFixed(0)}k</Text>
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
                    Rs.{((stats.totalCollection - stats.totalDistributed) / 1000).toFixed(1)}k
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
  container: { paddingHorizontal: 16, paddingVertical: 20 },
  content: { width: "100%", maxWidth: Math.min(screenWidth - 32, 400), alignSelf: "center", gap: 16 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { color: colors.white, marginTop: 12, fontSize: 16 },
  header: { color: colors.white, fontSize: 28, fontWeight: "700", textAlign: "center" },
  subtitle: { color: "rgba(255,255,255,0.8)", fontSize: 14, textAlign: "center", marginBottom: 8 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
  },
  statAmount: { color: colors.white, fontSize: 20, fontWeight: "700" },
  statNumber: { color: colors.white, fontSize: 24, fontWeight: "700" },
  statLabel: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 4 },
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
  sectionTitle: { color: colors.white, fontSize: 18, fontWeight: "600" },
  chartCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
  },
  chartTitle: { color: colors.blue2, fontSize: 16, fontWeight: "700", marginBottom: 16 },
  barsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", height: 160 },
  barColumn: { flex: 1, alignItems: "center" },
  barVisual: {
    width: 30,
    backgroundColor: colors.blue2,
    borderRadius: 4,
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
