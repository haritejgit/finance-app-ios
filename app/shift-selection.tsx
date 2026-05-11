import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Dimensions, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/auth-context";
import { getTodayDashboardStats } from "../src/repository";
import { colors, gradient } from "../src/theme";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const shortDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatMoney(value: number) {
  return `Rs.${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

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
    } catch {
      Alert.alert("Error", "Failed to load today's statistics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

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
            <View style={styles.hero}>
              <View style={styles.heroTop}>
                <View style={styles.avatar}>
                  <Ionicons name="wallet-outline" size={22} color={colors.white} />
                </View>
                <View style={styles.heroCopy}>
                  <Text style={styles.eyebrow}>Today overview</Text>
                  <Text style={styles.header}>Finance Dashboard</Text>
                </View>
              </View>
              <Text style={styles.welcome}>Welcome back, {user?.displayName || "User"}</Text>
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <View style={[styles.statIcon, styles.statIconGreen]}>
                  <Ionicons name="cash-outline" size={20} color={colors.teal} />
                </View>
                <Text style={styles.statLabel}>COLLECTION TODAY</Text>
                <Text style={styles.statAmount}>{loading ? "..." : formatMoney(todayStats.collectionToday)}</Text>
              </View>
              <View style={styles.statCard}>
                <View style={[styles.statIcon, styles.statIconOrange]}>
                  <Ionicons name="trending-up-outline" size={20} color={colors.coral} />
                </View>
                <Text style={styles.statLabel}>DISTRIBUTED TODAY</Text>
                <Text style={styles.statAmount}>{loading ? "..." : formatMoney(todayStats.distributedToday)}</Text>
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Collection route</Text>
                <Text style={styles.panelSub}>{selectedDay} / {selectedShift}</Text>
              </View>

              <Text style={styles.section}>Day</Text>
              <View style={styles.wrap}>
                {days.map((day, index) => (
                  <Pressable
                    key={day}
                    onPress={() => setSelectedDay(day)}
                    style={[styles.chip, selectedDay === day && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, selectedDay === day && styles.chipTextOn]}>{shortDays[index]}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.section}>Shift</Text>
              <View style={styles.row}>
                {(["Morning", "Evening"] as const).map((shift) => {
                  const active = selectedShift === shift;
                  return (
                    <Pressable
                      key={shift}
                      onPress={() => setSelectedShift(shift)}
                      style={[styles.shift, active && styles.shiftOn]}
                    >
                      <Ionicons
                        name={shift === "Morning" ? "sunny-outline" : "moon-outline"}
                        size={18}
                        color={active ? colors.white : colors.blue2}
                      />
                      <Text style={[styles.shiftText, active && styles.shiftTextOn]}>{shift}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Pressable
              style={styles.startBtn}
              onPress={() => router.push({ pathname: "/village/[day]/[shift]", params: { day: selectedDay, shift: selectedShift } })}
            >
              <Text style={styles.startText}>Start Collection</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.white} />
            </Pressable>

            <View style={styles.quickGrid}>
              <Pressable style={styles.quickBtn} onPress={() => router.push("/reports")}>
                <Ionicons name="document-text-outline" size={18} color={colors.blue2} />
                <Text style={styles.quickText}>Reports</Text>
              </Pressable>
              <Pressable style={styles.quickBtn} onPress={() => router.push("/graph")}>
                <Ionicons name="analytics-outline" size={18} color={colors.teal} />
                <Text style={styles.quickText}>Progress</Text>
              </Pressable>
              <Pressable style={styles.quickBtn} onPress={() => router.push("/settings")}>
                <Ionicons name="settings-outline" size={18} color={colors.coral} />
                <Text style={styles.quickText}>Settings</Text>
              </Pressable>
            </View>

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
  container: { paddingHorizontal: 16, paddingVertical: 12 },
  content: { width: "100%", maxWidth: Math.min(screenWidth - 32, 390), alignSelf: "center", gap: 12 },
  hero: { paddingTop: 4, gap: 8 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  heroCopy: { flex: 1 },
  eyebrow: { color: "rgba(255,255,255,0.76)", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  header: { color: colors.white, fontSize: 26, fontWeight: "800" },
  welcome: { color: "rgba(255,255,255,0.9)", fontSize: 14 },
  statsGrid: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 14,
    alignItems: "flex-start",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  statIcon: { width: 34, height: 34, borderRadius: 10, marginBottom: 10, alignItems: "center", justifyContent: "center" },
  statIconGreen: { backgroundColor: colors.mint },
  statIconOrange: { backgroundColor: "#FFF4E8" },
  statLabel: { color: "#64748b", fontSize: 10, fontWeight: "800", marginBottom: 4 },
  statAmount: { color: colors.ink, fontSize: 19, fontWeight: "800" },
  panel: { backgroundColor: "rgba(255,255,255,0.94)", borderRadius: 18, padding: 14, gap: 10 },
  panelHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  panelTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  panelSub: { color: colors.gray, fontSize: 12, fontWeight: "700" },
  section: { color: colors.gray, fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  wrap: { flexDirection: "row", gap: 6 },
  chip: {
    flex: 1,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: colors.white,
  },
  chipOn: { backgroundColor: colors.blue2, borderColor: colors.blue2 },
  chipText: { color: colors.gray, fontSize: 12, fontWeight: "800" },
  chipTextOn: { color: colors.white, fontWeight: "800", fontSize: 12 },
  row: { flexDirection: "row", gap: 12 },
  shift: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.white,
  },
  shiftOn: { backgroundColor: colors.blue2, borderColor: colors.blue2 },
  shiftText: { color: colors.blue2, fontWeight: "800", fontSize: 14 },
  shiftTextOn: { color: colors.white, fontSize: 14 },
  startBtn: {
    marginTop: 2,
    backgroundColor: colors.coral,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    shadowColor: "#7c2d12",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  startText: { color: colors.white, fontWeight: "800", fontSize: 15 },
  quickGrid: { flexDirection: "row", gap: 8 },
  quickBtn: { flex: 1, backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 14, paddingVertical: 12, alignItems: "center", gap: 4 },
  quickText: { color: colors.ink, fontWeight: "800", fontSize: 12 },
  logout: { color: colors.white, textAlign: "center", marginTop: 6, fontSize: 14, fontWeight: "700", opacity: 0.92 },
});
