import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Dimensions, Easing, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/auth-context";
import { CustomerSearchResult, getAllActiveCustomersWithVillages, getTodayDashboardStats, normalizeCustomerNumericalIdsForAllShifts } from "../src/repository";
import { colors, gradient } from "../src/theme";
import Icon from "../src/Icon";

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
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [allCustomers, setAllCustomers] = useState<CustomerSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const intro = useRef(new Animated.Value(0)).current;
  const routeNumberRepairRun = useRef(false);

  useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [intro]);

  const loadStats = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      if (!routeNumberRepairRun.current) {
        try {
          const updatedCustomers = await normalizeCustomerNumericalIdsForAllShifts(user.uid);
          routeNumberRepairRun.current = true;
          if (updatedCustomers > 0) {
            setAllCustomers([]);
          }
        } catch (repairError) {
          console.warn("Failed to repair customer book number gaps", repairError);
        }
      }
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

  const openCustomerSearch = useCallback(async () => {
    setSearchOpen(true);
    if (!user) return;
    try {
      setSearchLoading(true);
      const customers = await getAllActiveCustomersWithVillages(user.uid);
      setAllCustomers(customers);
    } catch {
      Alert.alert("Search failed", "Could not load customers. Please try again.");
    } finally {
      setSearchLoading(false);
    }
  }, [user]);

  const searchResults = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    const numericQuery = searchQuery.replace(/\D/g, "");
    if (!normalized) return allCustomers.slice(0, 30);
    return allCustomers.filter((customer) => {
      const textMatch = [
        customer.name,
        customer.phone,
        customer.aadhar || "",
        customer.numericalId.toString(),
        customer.coName || "",
        customer.coId?.toString() || "",
        customer.villageName || "",
        customer.villageDayOfWeek || "",
        customer.villageShift || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
      const phoneMatch = numericQuery.length > 0 && (customer.phone || "").replace(/\D/g, "").includes(numericQuery);
      return textMatch || phoneMatch;
    });
  }, [allCustomers, searchQuery]);

  return (
    <LinearGradient colors={[...gradient]} style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <Animated.View
            style={[
              styles.content,
              {
                opacity: intro,
                transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }],
              },
            ]}
          >
            <View style={styles.hero}>
              <View style={styles.heroTop}>
                <View style={styles.avatar}>
                  <Icon name="wallet-outline" size={22} color={colors.white} />
                </View>
                <View style={styles.heroCopy}>
                  <Text style={styles.eyebrow}>Today overview</Text>
                  <Text style={styles.header}>Finance Dashboard</Text>
                </View>
                <Pressable style={styles.heroSearchBtn} onPress={openCustomerSearch}>
                  <Icon name="search" size={20} color={colors.white} />
                </Pressable>
              </View>
              <Text style={styles.welcome}>Welcome back, {user?.displayName || "User"}</Text>
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <View style={[styles.statIcon, styles.statIconGreen]}>
                  <Icon name="cash-outline" size={20} color={colors.teal} />
                </View>
                <Text style={styles.statLabel}>COLLECTION TODAY</Text>
                <Text style={styles.statAmount}>{loading ? "..." : formatMoney(todayStats.collectionToday)}</Text>
              </View>
              <View style={styles.statCard}>
                <View style={[styles.statIcon, styles.statIconOrange]}>
                  <Icon name="trending-up-outline" size={20} color={colors.coral} />
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
                      <Icon
                        name={shift === "Morning" ? "sunny-outline" : "moon-outline"}
                        size={20}
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
              <Icon name="arrow-forward" size={18} color={colors.white} />
            </Pressable>

            <View style={styles.quickGrid}>
              <Pressable style={styles.quickBtn} onPress={() => router.push("/reports")}>
                <Icon name="document-text-outline" size={18} color={colors.blue2} />
                <Text style={styles.quickText}>Reports</Text>
              </Pressable>
              <Pressable style={styles.quickBtn} onPress={() => router.push("/graph")}>
                <Icon name="analytics-outline" size={18} color={colors.teal} />
                <Text style={styles.quickText}>Progress</Text>
              </Pressable>
              <Pressable style={styles.quickBtn} onPress={() => router.push("/settings")}>
                <Icon name="settings-outline" size={18} color={colors.coral} />
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
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      <Modal visible={searchOpen} animationType="slide" onRequestClose={() => setSearchOpen(false)}>
        <SafeAreaView style={styles.searchModalSafe}>
          <View style={styles.searchModalHeader}>
            <Text style={styles.searchModalTitle}>Search Customers</Text>
            <Pressable style={styles.searchCloseBtn} onPress={() => setSearchOpen(false)}>
              <Icon name="close" size={18} color={colors.gray} />
            </Pressable>
          </View>
          <View style={styles.searchModalContent}>
            <View style={styles.customerSearchShell}>
              <Icon name="search" size={18} color={colors.gray} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Name, mobile, Aadhar, book no, village..."
                placeholderTextColor="#94a3b8"
                style={styles.customerSearchInput}
                autoFocus
              />
            </View>
            {searchLoading ? (
              <View style={styles.searchLoading}>
                <ActivityIndicator color={colors.blue2} />
                <Text style={styles.searchLoadingText}>Loading customers...</Text>
              </View>
            ) : (
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.searchResultsList}
                ListEmptyComponent={
                  <View style={styles.searchEmpty}>
                    <Icon name="people" size={42} color="#94a3b8" />
                    <Text style={styles.searchEmptyText}>No customers found</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.searchCustomerRow}
                    onPress={() => {
                      setSearchOpen(false);
                      setSearchQuery("");
                      router.push(`/profile/${item.id}`);
                    }}
                  >
                    <View style={styles.searchCustomerBadge}>
                      <Text style={styles.searchCustomerBadgeText}>{item.numericalId}</Text>
                    </View>
                    <View style={styles.searchCustomerInfo}>
                      <Text style={styles.searchCustomerName}>{item.name}</Text>
                      <Text style={styles.searchCustomerMeta}>
                        {item.villageName || "No village"} | {item.villageDayOfWeek || "-"} {item.villageShift || ""}
                      </Text>
                      <Text style={styles.searchCustomerPhone}>{item.phone}</Text>
                    </View>
                    <Icon name="arrow-forward" size={16} color={colors.gray} />
                  </Pressable>
                )}
              />
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </LinearGradient>
  );
}

const screenWidth = Dimensions.get("window").width;

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  container: { paddingHorizontal: 16, paddingVertical: 12 },
  content: { width: "100%", maxWidth: Math.min(screenWidth - 32, 430), alignSelf: "center", gap: 12 },
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
  heroSearchBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.28)", alignItems: "center", justifyContent: "center" },
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
  panel: { backgroundColor: "rgba(255,255,255,0.96)", borderRadius: 20, padding: 16, gap: 10, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 4 },
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
  quickBtn: { flex: 1, backgroundColor: "rgba(255,255,255,0.94)", borderRadius: 16, paddingVertical: 12, alignItems: "center", gap: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  quickText: { color: colors.ink, fontWeight: "800", fontSize: 12 },
  logout: { color: colors.white, textAlign: "center", marginTop: 6, fontSize: 14, fontWeight: "700", opacity: 0.92 },
  searchModalSafe: { flex: 1, backgroundColor: "#eef4ff" },
  searchModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 14, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchModalTitle: { color: colors.ink, fontSize: 22, fontWeight: "900" },
  searchCloseBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" },
  searchModalContent: { flex: 1, padding: 16 },
  customerSearchShell: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, marginBottom: 12 },
  customerSearchInput: { flex: 1, paddingVertical: 13, color: colors.ink, fontSize: 14 },
  searchLoading: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 10 },
  searchLoadingText: { color: colors.gray, fontWeight: "700" },
  searchResultsList: { paddingBottom: 24 },
  searchEmpty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 10 },
  searchEmptyText: { color: colors.gray, fontWeight: "800" },
  searchCustomerRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.white, borderRadius: 16, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  searchCustomerBadge: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#eaf2ff", alignItems: "center", justifyContent: "center" },
  searchCustomerBadgeText: { color: colors.blue2, fontSize: 13, fontWeight: "900" },
  searchCustomerInfo: { flex: 1 },
  searchCustomerName: { color: colors.ink, fontSize: 15, fontWeight: "900" },
  searchCustomerMeta: { color: colors.gray, fontSize: 12, fontWeight: "700", marginTop: 2 },
  searchCustomerPhone: { color: colors.gray, fontSize: 12, marginTop: 2 },
});
