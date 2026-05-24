import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/auth-context";
import { AnimatedListItem } from "../src/components/AnimatedListItem";
import { AnimatedScreen } from "../src/components/AnimatedScreen";
import { CustomerIdBadge } from "../src/components/CustomerIdBadge";
import { getDashboardAnalytics, type CustomerState, type DashboardAnalytics } from "../src/finance-analytics";
import Icon from "../src/Icon";
import { lightImpact } from "../src/interactions";
import { CustomerSearchResult, getAllActiveCustomersWithVillages, getVillages } from "../src/repository";
import { useTheme } from "../src/theme-context";
import { Village } from "../src/types";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const shortDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const shifts = ["Morning", "Evening", "Full Day"] as const;
type Shift = (typeof shifts)[number];
const filters: { key: "all" | CustomerState; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid today" },
  { key: "closed", label: "Closed" },
];

function formatMoney(value: number) {
  return `Rs.${Math.round(value || 0).toLocaleString("en-IN")}`;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function SkeletonLine({ width = "100%" }: { width?: number | `${number}%` }) {
  return <View style={[styles.skeletonLine, { width }]} />;
}

function DashboardSkeleton() {
  return (
    <View style={styles.skeletonPanel}>
      <SkeletonLine width="45%" />
      <View style={styles.statsRow}>
        <SkeletonLine width="31%" />
        <SkeletonLine width="31%" />
        <SkeletonLine width="31%" />
      </View>
      <SkeletonLine />
    </View>
  );
}

const ToggleStatCard = memo(function ToggleStatCard({
  title,
  value,
  altTitle,
  altValue,
  icon,
  tone,
  isAlt,
  onToggle,
}: {
  title: string;
  value: string;
  altTitle?: string;
  altValue?: string;
  icon: string;
  tone: string;
  isAlt?: boolean;
  onToggle?: () => void;
}) {
  const fade = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fade, isAlt]);

  const pressIn = useCallback(() => {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, friction: 7, tension: 140 }).start();
  }, [scale]);

  const pressOut = useCallback(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7, tension: 140 }).start();
  }, [scale]);

  const handlePress = useCallback(() => {
    lightImpact();
    onToggle?.();
  }, [onToggle]);

  return (
    <Animated.View style={[styles.statCardWrap, { transform: [{ scale }] }]}>
      <Pressable
        accessibilityLabel={title}
        onPress={handlePress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={!onToggle}
        style={[styles.metricCard, { borderLeftColor: tone }]}
      >
        <View style={[styles.metricIcon, { backgroundColor: `${tone}18` }]}>
          <Icon name={icon} size={18} color={tone} />
        </View>
        <Animated.View style={{ opacity: fade }}>
          <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
            {isAlt ? altValue : value}
          </Text>
          <Text style={styles.metricTitle}>{isAlt ? altTitle : title}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
});

export default function ShiftSelectionScreen() {
  const nav = useRouter();
  const { user, logout } = useAuth();
  const { colors } = useTheme();
  const [selectedDay, setSelectedDay] = useState("Monday");
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [villages, setVillages] = useState<Village[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [todayToggle, setTodayToggle] = useState(false);
  const [distributedToggle, setDistributedToggle] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [customerFilter, setCustomerFilter] = useState<"all" | CustomerState>("all");
  const [allCustomers, setAllCustomers] = useState<CustomerSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const intro = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [intro]);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(searchQuery.trim().toLowerCase()), 220);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [nextAnalytics, nextVillages] = await Promise.all([
        getDashboardAnalytics(user.uid),
        getVillages(user.uid),
      ]);
      setAnalytics(nextAnalytics);
      setVillages(nextVillages);
    } catch (error) {
      console.error("Dashboard load failed", error);
      Alert.alert("Dashboard unavailable", "Could not load finance analytics. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [loadDashboard])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDashboard();
  }, [loadDashboard]);

  const openCustomerSearch = useCallback(async () => {
    lightImpact();
    setSearchOpen(true);
    if (!user || allCustomers.length > 0) return;
    try {
      setSearchLoading(true);
      setAllCustomers(await getAllActiveCustomersWithVillages(user.uid));
    } catch {
      Alert.alert("Search failed", "Could not load customers. Please try again.");
    } finally {
      setSearchLoading(false);
    }
  }, [allCustomers.length, user]);

  const searchResults = useMemo(() => {
    const numericQuery = debouncedQuery.replace(/\D/g, "");
    return allCustomers
      .filter((customer) => {
        const state = analytics?.customerStates[customer.id] ?? "pending";
        if (customerFilter !== "all" && state !== customerFilter) return false;
        if (!debouncedQuery) return true;
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
          .includes(debouncedQuery);
        const phoneMatch = numericQuery.length > 0 && (customer.phone || "").replace(/\D/g, "").includes(numericQuery);
        return textMatch || phoneMatch;
      })
      .slice(0, 80);
  }, [allCustomers, analytics?.customerStates, customerFilter, debouncedQuery]);

  const displayName = useMemo(() => (user?.displayName || user?.email || "User").split(/[ @]/)[0], [user?.displayName, user?.email]);
  const todayLabel = useMemo(() => new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" }), []);

  const startCollection = useCallback(() => {
    if (!selectedShift) return;
    lightImpact();
    router.push({ pathname: "/village/[day]/[shift]", params: { day: selectedDay, shift: selectedShift } });
  }, [selectedDay, selectedShift]);

  const selectedVillageForRoute = useMemo(() => {
    const dayVillages = villages.filter((village) => village.dayOfWeek === selectedDay);
    if (selectedShift && selectedShift !== "Full Day") {
      return dayVillages.find((village) => village.shift === selectedShift) ?? null;
    }
    return dayVillages[0] ?? null;
  }, [selectedDay, selectedShift, villages]);

  const openCustomerList = useCallback(() => {
    lightImpact();
    if (!selectedVillageForRoute) {
      Alert.alert("No village selected", "Choose a day and shift with at least one village before opening customers.");
      return;
    }
    router.push(`/customer/${selectedVillageForRoute.id}`);
  }, [selectedVillageForRoute]);

  const openVillageRoute = useCallback(() => {
    lightImpact();
    if (selectedShift && selectedShift !== "Full Day") {
      nav.push({ pathname: "/village/[day]/[shift]", params: { day: selectedDay, shift: selectedShift } });
      return;
    }
    if (selectedVillageForRoute) {
      nav.push({
        pathname: "/village/[day]/[shift]",
        params: { day: selectedVillageForRoute.dayOfWeek, shift: selectedVillageForRoute.shift },
      });
      return;
    }
    nav.push({ pathname: "/village/[day]/[shift]", params: { day: selectedDay, shift: "Morning" } });
  }, [nav, selectedDay, selectedShift, selectedVillageForRoute]);

  const quickActions = useMemo(
    () => [
      { label: "Reports", icon: "document-text-outline", action: () => nav.push("/reports") },
      { label: "Progress", icon: "bar-chart-outline", action: () => nav.push("/graph") },
      { label: "Settings", icon: "settings-outline", action: () => nav.push("/settings") },
      { label: "Day Report", icon: "calendar-outline", action: () => nav.push("/reports") },
      { label: "Villages", icon: "map-outline", action: openVillageRoute },
      { label: "Customers", icon: "people-outline", action: openCustomerList },
    ],
    [nav, openCustomerList, openVillageRoute]
  );

  return (
    <AnimatedScreen style={styles.root}>
      <LinearGradient colors={[colors.background, colors.backgroundSecondary]} style={styles.root}>
        <SafeAreaView style={styles.safe}>
          <ScrollView
            contentContainerStyle={styles.container}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
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
              <LinearGradient colors={["#1E40AF", "#3B82F6"]} style={styles.headerCard}>
                <View style={styles.headerCopy}>
                  <Text style={styles.header}>{getGreeting()}, {displayName} 👋</Text>
                  <Text style={styles.welcome}>{todayLabel}</Text>
                </View>
                <View style={styles.headerActions}>
                  <Pressable accessibilityLabel="Search customers" style={styles.heroIconBtn} onPress={openCustomerSearch}>
                    <Icon name="search" size={19} color={colors.white} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Logout"
                    style={styles.heroIconBtn}
                    onPress={async () => {
                      lightImpact();
                      await logout();
                      router.replace("/login");
                    }}
                  >
                    <Icon name="log-out-outline" size={19} color={colors.white} />
                  </Pressable>
                </View>
              </LinearGradient>

              {loading && !analytics ? (
                <DashboardSkeleton />
              ) : (
                <>
                  <View style={styles.statsRow}>
                    <ToggleStatCard
                      title="Today's Collection"
                      value={formatMoney(analytics?.totals.collectionToday ?? 0)}
                      altTitle="Today Distributed"
                      altValue={formatMoney(analytics?.totals.distributedToday ?? 0)}
                      icon="cash-outline"
                      tone="#10B981"
                      isAlt={todayToggle}
                      onToggle={() => setTodayToggle((value) => !value)}
                    />
                    <ToggleStatCard
                      title="Total Distributed"
                      value={formatMoney(analytics?.totals.distributedThisMonth ?? 0)}
                      altTitle="Today Collected"
                      altValue={formatMoney(analytics?.totals.collectionToday ?? 0)}
                      icon="trending-up-outline"
                      tone="#F59E0B"
                      isAlt={distributedToggle}
                      onToggle={() => setDistributedToggle((value) => !value)}
                    />
                    <ToggleStatCard
                      title="Active Loans"
                      value={`${analytics?.totals.activeLoanCount ?? 0}`}
                      icon="wallet-outline"
                      tone="#1E40AF"
                    />
                  </View>

                  <View style={styles.quickActionsSection}>
                    <Text style={styles.quickActionsTitle}>Quick Actions</Text>
                    <View style={styles.quickActionsGrid}>
                      {quickActions.map((item) => (
                        <Pressable
                          key={item.label}
                          accessibilityLabel={item.label}
                          onPress={() => {
                            lightImpact();
                            item.action();
                          }}
                          style={({ pressed }) => [
                            styles.card,
                            pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] },
                          ]}
                        >
                          {Platform.OS === "web" ? (
                            <Icon name={item.icon} size={28} color="#1B4332" />
                          ) : (
                            <Ionicons name={item.icon as any} size={28} color="#1B4332" />
                          )}
                          <Text style={styles.quickActionLabel}>{item.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <View style={styles.panel}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>Start Collection</Text>
                      <Text style={styles.sectionSub}>{selectedDay}{selectedShift ? ` / ${selectedShift}` : ""}</Text>
                    </View>

                    <View style={styles.dayGrid}>
                      {days.map((day, index) => (
                        <Pressable
                          key={day}
                          accessibilityLabel={`Select ${day}`}
                          onPress={() => {
                            lightImpact();
                            setSelectedDay(day);
                          }}
                          style={[styles.dayChip, selectedDay === day && styles.dayChipOn]}
                        >
                          <Text style={[styles.dayChipText, selectedDay === day && styles.dayChipTextOn]}>{shortDays[index]}</Text>
                        </Pressable>
                      ))}
                    </View>

                    <View style={styles.shiftRow}>
                      {shifts.map((shift) => {
                        const active = selectedShift === shift;
                        return (
                          <Pressable
                            key={shift}
                            accessibilityLabel={`Select ${shift} shift`}
                            onPress={() => {
                              lightImpact();
                              setSelectedShift(shift);
                            }}
                            style={[styles.shift, active && styles.shiftOn]}
                          >
                            <Icon name={shift === "Morning" ? "sunny-outline" : shift === "Evening" ? "moon-outline" : "calendar-outline"} size={17} color={active ? colors.white : colors.primary} />
                            <Text style={[styles.shiftText, active && styles.shiftTextOn]}>{shift}</Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {selectedShift ? (
                      <Pressable accessibilityLabel="Start Collection" onPress={startCollection}>
                        <LinearGradient colors={["#1E40AF", "#3730A3"]} style={styles.primaryAction}>
                          <Text style={styles.primaryActionText}>Start Collection</Text>
                          <Icon name="arrow-forward" size={18} color={colors.white} />
                        </LinearGradient>
                      </Pressable>
                    ) : null}
                  </View>

                </>
              )}
            </Animated.View>
          </ScrollView>
        </SafeAreaView>

        <Modal visible={searchOpen} animationType="slide" onRequestClose={() => setSearchOpen(false)}>
          <SafeAreaView style={[styles.searchModalSafe, { backgroundColor: colors.background }]}>
            <View style={styles.searchModalHeader}>
              <Text style={styles.searchModalTitle}>Smart Customer Search</Text>
              <Pressable style={styles.searchCloseBtn} onPress={() => setSearchOpen(false)}>
                <Icon name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
            <View style={styles.searchModalContent}>
              <View style={styles.customerSearchShell}>
                <Icon name="search" size={18} color={colors.textSecondary} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Name, mobile, Aadhar, book no, village..."
                  placeholderTextColor={colors.textMuted}
                  style={styles.customerSearchInput}
                  autoFocus
                />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {filters.map((filter) => {
                  const active = customerFilter === filter.key;
                  return (
                    <Pressable
                      key={filter.key}
                      onPress={() => {
                        lightImpact();
                        setCustomerFilter(filter.key);
                      }}
                      style={[styles.filterChip, active && styles.filterChipOn]}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextOn]}>{filter.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {searchLoading ? (
                <View style={styles.searchLoading}>
                  <SkeletonLine width="72%" />
                  <SkeletonLine />
                  <SkeletonLine width="88%" />
                </View>
              ) : (
                <FlatList
                  data={searchResults}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.searchResultsList}
                  initialNumToRender={20}
                  windowSize={8}
                  ListEmptyComponent={
                    <View style={styles.searchEmpty}>
                      <Icon name="people" size={42} color={colors.textMuted} />
                      <Text style={styles.searchEmptyText}>No customers found</Text>
                    </View>
                  }
                  renderItem={({ item, index }) => {
                    const state = analytics?.customerStates[item.id] ?? "pending";
                    return (
                      <AnimatedListItem index={index}>
                        <Pressable
                          style={styles.searchCustomerRow}
                          onPress={() => {
                            lightImpact();
                            setSearchOpen(false);
                            setSearchQuery("");
                            router.push(`/profile/${item.id}`);
                          }}
                        >
                          <CustomerIdBadge numericalId={item.numericalId} id={item.id} />
                          <View style={styles.searchCustomerInfo}>
                            <Text style={styles.searchCustomerName}>{item.name}</Text>
                            <Text style={styles.searchCustomerMeta}>
                              {item.villageName || "No village"} | {item.villageDayOfWeek || "-"} {item.villageShift || ""}
                            </Text>
                            <Text style={styles.searchCustomerPhone}>{item.phone}</Text>
                          </View>
                          <Text style={styles.statePill}>{state}</Text>
                        </Pressable>
                      </AnimatedListItem>
                    );
                  }}
                />
              )}
            </View>
          </SafeAreaView>
        </Modal>
      </LinearGradient>
    </AnimatedScreen>
  );
}

const screenWidth = Dimensions.get("window").width;

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  container: { paddingHorizontal: 20, paddingVertical: 12, paddingBottom: 32 },
  content: { width: "100%", maxWidth: Math.min(screenWidth - 40, 920), alignSelf: "center", gap: 14 },
  headerCard: { borderRadius: 16, padding: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 4 },
  headerCopy: { flex: 1 },
  headerActions: { flexDirection: "row", gap: 8 },
  heroIconBtn: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.24)" },
  header: { color: "#FFFFFF", fontSize: 23, lineHeight: 28, fontWeight: "700" },
  welcome: { color: "rgba(255,255,255,0.76)", fontSize: 13, marginTop: 4, fontWeight: "500" },
  statsRow: { flexDirection: "row", gap: 10 },
  statCardWrap: { flex: 1, minWidth: 0 },
  metricCard: { minHeight: 116, borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCE6F7", borderLeftWidth: 4, padding: 12, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 },
  metricIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  metricValue: { color: "#111827", fontSize: 20, fontWeight: "700" },
  metricTitle: { color: "#6B7280", fontSize: 11, lineHeight: 14, fontWeight: "500", marginTop: 4 },
  quickActionsSection: { gap: 10 },
  quickActionsTitle: { color: "#111827", fontSize: 20, fontWeight: "700" },
  quickActionsGrid: { flexDirection: "row", flexWrap: "wrap" },
  card: { width: "47%", flexGrow: 1, backgroundColor: "#ffffff", borderRadius: 16, padding: 16, margin: 6, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, elevation: 3, alignItems: "center", justifyContent: "center", minHeight: 96, minWidth: 44 },
  quickActionLabel: { fontSize: 13, fontWeight: "600", color: "#1B4332", marginTop: 8, textAlign: "center" },
  panel: { backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#DCE6F7", padding: 16, gap: 13, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 },
  menuPanel: { backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#DCE6F7", padding: 16, gap: 13, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 },
  menuGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  menuTile: { width: "31%", minWidth: 96, flexGrow: 1, minHeight: 84, borderRadius: 14, borderWidth: 1, borderColor: "#DCE6F7", backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center", gap: 8 },
  menuTilePressed: { transform: [{ scale: 0.97 }], backgroundColor: "#EFF6FF" },
  menuTileDisabled: { opacity: 0.48 },
  menuTileText: { color: "#111827", fontSize: 12, fontWeight: "800", textAlign: "center" },
  menuTileTextDisabled: { color: "#9CA3AF" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  sectionTitle: { color: "#111827", fontSize: 20, fontWeight: "700" },
  sectionSub: { color: "#6B7280", fontSize: 12, fontWeight: "500" },
  dayGrid: { flexDirection: "row", gap: 6 },
  dayChip: { flex: 1, borderWidth: 1, borderColor: "#DCE6F7", borderRadius: 12, paddingVertical: 10, alignItems: "center", backgroundColor: "#F8FAFC" },
  dayChipOn: { backgroundColor: "#1E40AF", borderColor: "#1E40AF" },
  dayChipText: { color: "#6B7280", fontSize: 12, fontWeight: "700" },
  dayChipTextOn: { color: "#FFFFFF" },
  shiftRow: { flexDirection: "row", gap: 8 },
  shift: { flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: "#DCE6F7", backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, paddingHorizontal: 4 },
  shiftOn: { backgroundColor: "#10B981", borderColor: "#10B981" },
  shiftText: { color: "#1E40AF", fontWeight: "700", fontSize: 13 },
  shiftTextOn: { color: "#FFFFFF" },
  primaryAction: { borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryActionText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  skeletonPanel: { backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#DCE6F7", padding: 16, gap: 14 },
  skeletonLine: { height: 16, borderRadius: 999, backgroundColor: "#DCE6F7" },
  searchModalSafe: { flex: 1 },
  searchModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 14, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#DCE6F7" },
  searchModalTitle: { color: "#111827", fontSize: 22, fontWeight: "700" },
  searchCloseBtn: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
  searchModalContent: { flex: 1, padding: 16 },
  customerSearchShell: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, borderWidth: 1, borderColor: "#DCE6F7", backgroundColor: "#FFFFFF", paddingHorizontal: 12, marginBottom: 10 },
  customerSearchInput: { flex: 1, paddingVertical: 13, fontSize: 15, color: "#111827" },
  filterRow: { gap: 8, paddingBottom: 12 },
  filterChip: { borderRadius: 999, borderWidth: 1, borderColor: "#DCE6F7", paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#FFFFFF" },
  filterChipOn: { backgroundColor: "#1E40AF", borderColor: "#1E40AF" },
  filterChipText: { color: "#6B7280", fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  filterChipTextOn: { color: "#FFFFFF" },
  searchLoading: { paddingVertical: 30, gap: 12 },
  searchResultsList: { paddingBottom: 24 },
  searchEmpty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 10 },
  searchEmptyText: { color: "#6B7280", fontWeight: "700" },
  searchCustomerRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "#DCE6F7", backgroundColor: "#FFFFFF" },
  searchCustomerBadge: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#DBEAFE" },
  searchCustomerBadgeText: { color: "#1E40AF", fontSize: 13, fontWeight: "700" },
  searchCustomerInfo: { flex: 1 },
  searchCustomerName: { color: "#111827", fontSize: 15, fontWeight: "700" },
  searchCustomerMeta: { color: "#6B7280", fontSize: 12, fontWeight: "500", marginTop: 2 },
  searchCustomerPhone: { color: "#9CA3AF", fontSize: 12, marginTop: 2 },
  statePill: { color: "#1E40AF", backgroundColor: "#DBEAFE", fontSize: 10, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, overflow: "hidden", textTransform: "uppercase" },
});
