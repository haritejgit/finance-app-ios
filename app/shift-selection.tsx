import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Dimensions, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../src/auth-context";
import { getTodayDashboardStats } from "../src/repository";
import { colors, gradient } from "../src/theme";
import { SafeAreaView } from "react-native-safe-area-context";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function ShiftSelectionScreen() {
  const { user, logout } = useAuth();
  const [selectedDay, setSelectedDay] = useState("Monday");
  const [selectedShift, setSelectedShift] = useState<"Morning" | "Evening">("Morning");
  const [todayStats, setTodayStats] = useState({ collectionToday: 0, distributedToday: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const stats = await getTodayDashboardStats(user.uid);
      setTodayStats(stats);
    } catch (error) {
      Alert.alert("Error", "Failed to load today's statistics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  // Load stats when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadStats();
  }, [loadStats]);

  return (
    <LinearGradient colors={[...gradient]} style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.content}>
            <Text style={styles.header}>Finance Dashboard</Text>
            <Text style={styles.welcome}>Welcome back, {user?.displayName || "User"}</Text>
            <View style={styles.statsGrid}>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>TOTAL COLLECTION TODAY</Text>
                <Text style={styles.cardAmount}>Rs.{todayStats.collectionToday.toFixed(2)}</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>TOTAL DISTRIBUTED TODAY</Text>
                <Text style={styles.cardAmount}>Rs.{todayStats.distributedToday.toFixed(2)}</Text>
              </View>
            </View>

            <Text style={styles.section}>Select Collection Day</Text>
            <View style={styles.wrap}>
              {days.map((d) => (
                <Pressable key={d} onPress={() => setSelectedDay(d)} style={[styles.chip, selectedDay === d && styles.chipOn]}>
                  <Text style={[styles.chipText, selectedDay === d && styles.chipTextOn]}>{d}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.section}>Select Shift</Text>
            <View style={styles.row}>
              {(["Morning", "Evening"] as const).map((s) => (
                <Pressable key={s} onPress={() => setSelectedShift(s)} style={[styles.shift, selectedShift === s && styles.shiftOn]}>
                  <Text style={[styles.shiftText, selectedShift === s && styles.shiftTextOn]}>{s}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={styles.startBtn}
              onPress={() => router.push(`/village/${selectedDay}/${selectedShift}`)}
            >
              <Text style={styles.startText}>START COLLECTION</Text>
            </Pressable>

            <Pressable style={styles.outlineBtn} onPress={() => router.push("/reports")}>
              <Text style={styles.outlineText}>VIEW REPORTS</Text>
            </Pressable>
            <Pressable style={styles.graphBtn} onPress={() => router.push("/graph")}>
              <Text style={styles.graphBtnText}>📈 PROGRESS</Text>
            </Pressable>
            <Pressable style={styles.outlineBtn} onPress={() => router.push("/settings")}>
              <Text style={styles.outlineText}>SETTINGS</Text>
            </Pressable>

            <Pressable
              onPress={async () => {
                await logout();
                router.replace("/login");
              }}
            >
              <Text style={styles.logout}>Logout</Text>
            </Pressable>
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
  container: { paddingHorizontal: 16, paddingVertical: 8 },
  content: { width: "100%", maxWidth: Math.min(screenWidth - 32, 370), alignSelf: "center", gap: 10 },
  header: { color: colors.white, fontSize: 28, fontWeight: "700" },
  welcome: { color: "rgba(255,255,255,0.9)", marginBottom: 8 },
  statsGrid: { gap: 10 },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 16 },
  cardLabel: { color: colors.blue2, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  cardAmount: { color: colors.blue2, fontSize: 18, fontWeight: "800" },
  section: { color: colors.white, fontSize: 16, fontWeight: "600", marginTop: 8 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderColor: "rgba(255,255,255,0.4)", borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  chipOn: { backgroundColor: colors.white },
  chipText: { color: colors.white },
  chipTextOn: { color: colors.blue3, fontWeight: "700" },
  row: { flexDirection: "row", gap: 12 },
  shift: { flex: 1, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.4)", paddingVertical: 18, alignItems: "center" },
  shiftOn: { backgroundColor: colors.white },
  shiftText: { color: colors.white, fontWeight: "700" },
  shiftTextOn: { color: colors.blue2 },
  startBtn: { marginTop: 16, backgroundColor: colors.white, borderRadius: 28, padding: 16, alignItems: "center" },
  startText: { color: colors.blue3, fontWeight: "800" },
  outlineBtn: { borderWidth: 1, borderColor: colors.white, borderRadius: 28, padding: 14, alignItems: "center" },
  outlineText: { color: colors.white, fontWeight: "700" },
  graphBtn: { backgroundColor: "#9C27B0", borderRadius: 28, padding: 14, alignItems: "center" },
  graphBtnText: { color: colors.white, fontWeight: "700" },
  logout: { color: colors.white, textAlign: "center", marginTop: 12 },
});
