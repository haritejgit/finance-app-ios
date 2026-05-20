import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Linking,
  Modal,
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
import {
  CustomerSearchResult,
  getAllActiveCustomersWithVillages,
  normalizeCustomerNumericalIdsForAllShifts,
} from "../src/repository";
import { getDashboardAnalytics, type CustomerState, type DashboardAnalytics } from "../src/finance-analytics";
import { getGradient } from "../src/theme";
import { useTheme } from "../src/theme-context";
import Icon from "../src/Icon";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const shortDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
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

function formatCompact(value: number) {
  if (Math.abs(value) >= 100000) return `Rs.${(value / 100000).toFixed(1)}L`;
  if (Math.abs(value) >= 1000) return `Rs.${(value / 1000).toFixed(1)}k`;
  return formatMoney(value);
}

function getMonthlyDelta(analytics?: DashboardAnalytics | null) {
  if (!analytics) return "0%";
  const previous = analytics.totals.previousMonthlyRevenue;
  if (previous <= 0) return analytics.totals.monthlyRevenue > 0 ? "New" : "0%";
  const delta = ((analytics.totals.monthlyRevenue - previous) / previous) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
}

function SkeletonLine({ width = "100%" }: { width?: number | `${number}%` }) {
  const { colors } = useTheme();
  return <View style={[styles.skeletonLine, { width, backgroundColor: colors.glassBorder }]} />;
}

function DashboardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
      <SkeletonLine width="42%" />
      <SkeletonLine />
      <View style={styles.skeletonGrid}>
        <SkeletonLine width="48%" />
        <SkeletonLine width="48%" />
      </View>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

function MetricCard({
  title,
  value,
  detail,
  icon,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  icon: string;
  tone: "blue" | "green" | "orange" | "red";
}) {
  const { colors } = useTheme();
  const toneColor =
    tone === "green" ? colors.success : tone === "orange" ? colors.coral : tone === "red" ? colors.error : colors.primary;
  const softColor =
    tone === "green" ? colors.successSoft : tone === "orange" ? colors.warningSoft : tone === "red" ? colors.destructiveSoft : colors.primarySoft;
  return (
    <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.metricIcon, { backgroundColor: softColor }]}>
        <Icon name={icon} size={18} color={toneColor} />
      </View>
      <Text style={[styles.metricTitle, { color: colors.textSecondary }]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={[styles.metricValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {value}
      </Text>
      <Text style={[styles.metricDetail, { color: colors.textMuted }]} numberOfLines={1}>
        {detail}
      </Text>
    </View>
  );
}

function MiniBarChart({ data }: { data: DashboardAnalytics["weeklyTrend"] }) {
  const { colors } = useTheme();
  const maxValue = Math.max(...data.map((item) => Math.max(item.collection, item.distribution)), 1);
  return (
    <View style={styles.chartWrap}>
      {data.map((item) => (
        <View key={item.label} style={styles.chartColumn}>
          <View style={styles.chartBars}>
            <View
              style={[
                styles.chartBar,
                { height: Math.max(6, (item.distribution / maxValue) * 102), backgroundColor: colors.warning },
              ]}
            />
            <View
              style={[
                styles.chartBar,
                styles.chartBarCollection,
                { height: Math.max(6, (item.collection / maxValue) * 118), backgroundColor: colors.primary },
              ]}
            />
          </View>
          <Text style={[styles.chartLabel, { color: colors.textMuted }]}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function InsightList({ title, icon, items }: { title: string; icon: string; items: string[] }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: colors.primarySoft }]}>
          <Icon name={icon} size={18} color={colors.primary} />
        </View>
        <Text style={[styles.sectionTitleDark, { color: colors.text }]}>{title}</Text>
      </View>
      {items.map((item) => (
        <View key={item} style={styles.insightRow}>
          <View style={[styles.insightDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.insightText, { color: colors.textSecondary }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ShiftSelectionScreen() {
  const { user, logout } = useAuth();
  const { colors } = useTheme();
  const [selectedDay, setSelectedDay] = useState("Monday");
  const [selectedShift, setSelectedShift] = useState<"Morning" | "Evening">("Morning");
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [customerFilter, setCustomerFilter] = useState<"all" | CustomerState>("all");
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

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(searchQuery.trim().toLowerCase()), 220);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      if (!routeNumberRepairRun.current) {
        try {
          await normalizeCustomerNumericalIdsForAllShifts(user.uid);
          routeNumberRepairRun.current = true;
        } catch (repairError) {
          console.warn("Failed to repair customer book number gaps", repairError);
        }
      }
      const nextAnalytics = await getDashboardAnalytics(user.uid);
      setAnalytics(nextAnalytics);
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

  const sendReminder = useCallback((phone: string, customerName: string, balanceAmount: number) => {
    const digits = phone.replace(/\D/g, "");
    if (!digits) {
      Alert.alert("Missing phone", "This customer does not have a valid phone number.");
      return;
    }
    const text = `Hi ${customerName}, this is a payment reminder. Outstanding balance: ${formatMoney(balanceAmount)}. Please clear it at the earliest.`;
    const normalized = digits.length === 10 ? `91${digits}` : digits;
    Linking.openURL(`https://wa.me/${normalized}?text=${encodeURIComponent(text)}`).catch(() => {
      Alert.alert("WhatsApp unavailable", "Could not open WhatsApp reminder.");
    });
  }, []);

  const gradient = getGradient(colors);

  return (
    <LinearGradient colors={[...gradient]} style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.white} />}
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
            <View style={[styles.heroCard, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
              <View style={styles.heroTop}>
                <View style={[styles.avatar, { backgroundColor: colors.primarySoft }]}>
                  <Icon name="wallet-outline" size={22} color={colors.primary} />
                </View>
                <View style={styles.heroCopy}>
                  <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>Premium finance workspace</Text>
                  <Text style={[styles.header, { color: colors.text }]}>Finance Dashboard</Text>
                  <Text style={[styles.welcome, { color: colors.textSecondary }]}>
                    Welcome back, {user?.displayName || user?.email || "User"}
                  </Text>
                </View>
                <Pressable style={[styles.heroIconBtn, { backgroundColor: colors.primary }]} onPress={openCustomerSearch}>
                  <Icon name="search" size={19} color={colors.white} />
                </Pressable>
              </View>
              <View style={styles.heroMetricRow}>
                <View>
                  <Text style={[styles.heroMetricLabel, { color: colors.textSecondary }]}>Today collection</Text>
                  <Text style={[styles.heroMetricValue, { color: colors.text }]}>
                    {loading ? "..." : formatMoney(analytics?.totals.collectionToday ?? 0)}
                  </Text>
                </View>
                <View style={[styles.deltaPill, { backgroundColor: colors.successSoft }]}>
                  <Icon name="trending-up" size={16} color={colors.success} />
                  <Text style={[styles.deltaPillText, { color: colors.success }]}>{getMonthlyDelta(analytics)}</Text>
                </View>
              </View>
            </View>

            {loading && !analytics ? (
              <DashboardSkeleton />
            ) : (
              <>
                <View style={styles.metricsGrid}>
                  <MetricCard
                    title="Total collection"
                    value={formatMoney(analytics?.totals.totalCollection ?? 0)}
                    detail="All-time regular payments"
                    icon="cash-outline"
                    tone="green"
                  />
                  <MetricCard
                    title="Pending amount"
                    value={formatMoney(analytics?.totals.pendingAmount ?? 0)}
                    detail={`${analytics?.totals.activeLoanCount ?? 0} active loans`}
                    icon="alert-circle-outline"
                    tone="red"
                  />
                  <MetricCard
                    title="Monthly revenue"
                    value={formatMoney(analytics?.totals.monthlyRevenue ?? 0)}
                    detail={`${getMonthlyDelta(analytics)} vs last month`}
                    icon="trending-up-outline"
                    tone="blue"
                  />
                  <MetricCard
                    title="Customers"
                    value={`${analytics?.totals.customerCount ?? 0}`}
                    detail={`${analytics?.totals.dueMarksThisMonth ?? 0} dues this month`}
                    icon="people"
                    tone="orange"
                  />
                </View>

                <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={[styles.sectionTitleDark, { color: colors.text }]}>Collection Trend</Text>
                      <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>Collection and distribution across recent weeks</Text>
                    </View>
                    <View style={styles.legendRow}>
                      <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                      <Text style={[styles.legendText, { color: colors.textMuted }]}>In</Text>
                      <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
                      <Text style={[styles.legendText, { color: colors.textMuted }]}>Out</Text>
                    </View>
                  </View>
                  <MiniBarChart data={analytics?.weeklyTrend ?? []} />
                </View>

                <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitleDark, { color: colors.text }]}>Collection Route</Text>
                    <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
                      {selectedDay} / {selectedShift}
                    </Text>
                  </View>
                  <Text style={[styles.controlLabel, { color: colors.textSecondary }]}>Day</Text>
                  <View style={styles.dayGrid}>
                    {days.map((day, index) => (
                      <Pressable
                        key={day}
                        onPress={() => setSelectedDay(day)}
                        style={[
                          styles.dayChip,
                          { backgroundColor: colors.surfaceTint, borderColor: colors.border },
                          selectedDay === day && { backgroundColor: colors.primary, borderColor: colors.primary },
                        ]}
                      >
                        <Text style={[styles.dayChipText, { color: selectedDay === day ? colors.white : colors.textSecondary }]}>
                          {shortDays[index]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={[styles.controlLabel, { color: colors.textSecondary }]}>Shift</Text>
                  <View style={styles.shiftRow}>
                    {(["Morning", "Evening"] as const).map((shift) => {
                      const active = selectedShift === shift;
                      return (
                        <Pressable
                          key={shift}
                          onPress={() => setSelectedShift(shift)}
                          style={[
                            styles.shift,
                            { backgroundColor: colors.surfaceTint, borderColor: colors.border },
                            active && { backgroundColor: colors.primary, borderColor: colors.primary },
                          ]}
                        >
                          <Icon name={shift === "Morning" ? "sunny-outline" : "moon-outline"} size={18} color={active ? colors.white : colors.primary} />
                          <Text style={[styles.shiftText, { color: active ? colors.white : colors.primary }]}>{shift}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Pressable
                    style={[styles.primaryAction, { backgroundColor: colors.coral }]}
                    onPress={() => router.push({ pathname: "/village/[day]/[shift]", params: { day: selectedDay, shift: selectedShift } })}
                  >
                    <Text style={styles.primaryActionText}>Start Collection</Text>
                    <Icon name="arrow-forward" size={18} color={colors.white} />
                  </Pressable>
                </View>

                <View style={styles.quickGrid}>
                  {[
                    { label: "Reports", icon: "document-text-outline", href: "/reports" },
                    { label: "Analytics", icon: "analytics-outline", href: "/graph" },
                    { label: "Settings", icon: "settings-outline", href: "/settings" },
                  ].map((item) => (
                    <Pressable
                      key={item.label}
                      style={[styles.quickBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => router.push(item.href as any)}
                    >
                      <Icon name={item.icon} size={18} color={colors.primary} />
                      <Text style={[styles.quickText, { color: colors.text }]}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitleDark, { color: colors.text }]}>Due Payment Alerts</Text>
                    <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>Priority follow-ups</Text>
                  </View>
                  {analytics?.dueAlerts.length ? (
                    analytics.dueAlerts.slice(0, 4).map((alert) => (
                      <View key={alert.customerId} style={[styles.alertRow, { borderColor: colors.border }]}>
                        <View style={styles.alertCopy}>
                          <Text style={[styles.alertName, { color: colors.text }]}>{alert.customerName}</Text>
                          <Text style={[styles.alertMeta, { color: colors.textSecondary }]}>
                            {alert.villageName} | {alert.dueCount} due mark{alert.dueCount === 1 ? "" : "s"} | {formatCompact(alert.balanceAmount)}
                          </Text>
                        </View>
                        <Pressable
                          style={[styles.reminderBtn, { backgroundColor: colors.successSoft }]}
                          onPress={() => sendReminder(alert.phone, alert.customerName, alert.balanceAmount)}
                        >
                          <Icon name="logo-whatsapp" size={17} color={colors.success} />
                        </Pressable>
                      </View>
                    ))
                  ) : (
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No urgent dues in active loans.</Text>
                  )}
                </View>

                <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitleDark, { color: colors.text }]}>Recent Transactions</Text>
                    <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>Latest successful collections</Text>
                  </View>
                  {analytics?.recentTransactions.length ? (
                    analytics.recentTransactions.slice(0, 5).map((item) => (
                      <Pressable
                        key={item.id}
                        style={[styles.transactionRow, { borderColor: colors.border }]}
                        onPress={() => item.customerId && router.push(`/profile/${item.customerId}`)}
                      >
                        <View style={[styles.transactionIcon, { backgroundColor: colors.primarySoft }]}>
                          <Icon name={item.paymentMode === "PHONE" ? "phone-portrait-outline" : "cash-outline"} size={17} color={colors.primary} />
                        </View>
                        <View style={styles.alertCopy}>
                          <Text style={[styles.alertName, { color: colors.text }]}>{item.customerName}</Text>
                          <Text style={[styles.alertMeta, { color: colors.textSecondary }]}>
                            {item.villageName} | {new Date(item.paymentDate).toLocaleDateString()}
                          </Text>
                        </View>
                        <Text style={[styles.transactionAmount, { color: colors.success }]}>{formatCompact(item.amountPaid)}</Text>
                      </Pressable>
                    ))
                  ) : (
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Transactions will appear after payments are recorded.</Text>
                  )}
                </View>

                <InsightList title="Financial Insights" icon="sparkles-outline" items={analytics?.insights ?? []} />
                <InsightList title="AI Financial Insights" icon="shield-checkmark-outline" items={analytics?.aiInsights ?? []} />

                <Pressable
                  onPress={async () => {
                    await logout();
                    router.replace("/login");
                  }}
                >
                  <Text style={[styles.logout, { color: colors.white }]}>Logout</Text>
                </Pressable>
              </>
            )}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      <Modal visible={searchOpen} animationType="slide" onRequestClose={() => setSearchOpen(false)}>
        <SafeAreaView style={[styles.searchModalSafe, { backgroundColor: colors.background }]}>
          <View style={[styles.searchModalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Text style={[styles.searchModalTitle, { color: colors.text }]}>Smart Customer Search</Text>
            <Pressable style={[styles.searchCloseBtn, { backgroundColor: colors.surfaceTint }]} onPress={() => setSearchOpen(false)}>
              <Icon name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
          <View style={styles.searchModalContent}>
            <View style={[styles.customerSearchShell, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Icon name="search" size={18} color={colors.textSecondary} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Name, mobile, Aadhar, book no, village..."
                placeholderTextColor={colors.textMuted}
                style={[styles.customerSearchInput, { color: colors.text }]}
                autoFocus
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {filters.map((filter) => {
                const active = customerFilter === filter.key;
                return (
                  <Pressable
                    key={filter.key}
                    onPress={() => setCustomerFilter(filter.key)}
                    style={[
                      styles.filterChip,
                      { backgroundColor: colors.card, borderColor: colors.border },
                      active && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                  >
                    <Text style={[styles.filterChipText, { color: active ? colors.white : colors.textSecondary }]}>{filter.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {searchLoading ? (
              <View style={styles.searchLoading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.searchLoadingText, { color: colors.textSecondary }]}>Loading customers...</Text>
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
                    <Text style={[styles.searchEmptyText, { color: colors.textSecondary }]}>No customers found</Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const state = analytics?.customerStates[item.id] ?? "pending";
                  return (
                    <Pressable
                      style={[styles.searchCustomerRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => {
                        setSearchOpen(false);
                        setSearchQuery("");
                        router.push(`/profile/${item.id}`);
                      }}
                    >
                      <View style={[styles.searchCustomerBadge, { backgroundColor: colors.primarySoft }]}>
                        <Text style={[styles.searchCustomerBadgeText, { color: colors.primary }]}>{item.numericalId}</Text>
                      </View>
                      <View style={styles.searchCustomerInfo}>
                        <Text style={[styles.searchCustomerName, { color: colors.text }]}>{item.name}</Text>
                        <Text style={[styles.searchCustomerMeta, { color: colors.textSecondary }]}>
                          {item.villageName || "No village"} | {item.villageDayOfWeek || "-"} {item.villageShift || ""}
                        </Text>
                        <Text style={[styles.searchCustomerPhone, { color: colors.textMuted }]}>{item.phone}</Text>
                      </View>
                      <Text style={[styles.statePill, { color: colors.primary, backgroundColor: colors.primarySoft }]}>{state}</Text>
                    </Pressable>
                  );
                }}
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
  container: { paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 32 },
  content: { width: "100%", maxWidth: Math.min(screenWidth - 32, 1120), alignSelf: "center", gap: 14 },
  heroCard: { borderRadius: 24, padding: 18, borderWidth: 1, gap: 20 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1 },
  heroIconBtn: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  header: { fontSize: 29, fontWeight: "900" },
  welcome: { fontSize: 13, marginTop: 2, fontWeight: "700" },
  heroMetricRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 16 },
  heroMetricLabel: { fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  heroMetricValue: { fontSize: 34, fontWeight: "900", marginTop: 2 },
  deltaPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  deltaPillText: { fontWeight: "900", fontSize: 12 },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: { flexGrow: 1, flexBasis: "47%", minWidth: 156, borderRadius: 18, borderWidth: 1, padding: 14 },
  metricIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  metricTitle: { fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  metricValue: { fontSize: 22, fontWeight: "900", marginTop: 4 },
  metricDetail: { fontSize: 11, fontWeight: "700", marginTop: 3 },
  panel: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 12 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  sectionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sectionTitleDark: { fontSize: 18, fontWeight: "900" },
  sectionSub: { fontSize: 11, fontWeight: "700" },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, fontWeight: "800" },
  chartWrap: { height: 154, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 8 },
  chartColumn: { flex: 1, alignItems: "center", gap: 6 },
  chartBars: { height: 124, alignItems: "flex-end", justifyContent: "flex-end", flexDirection: "row", gap: 3 },
  chartBar: { width: 10, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  chartBarCollection: { width: 13 },
  chartLabel: { fontSize: 9, fontWeight: "800" },
  controlLabel: { fontSize: 11, fontWeight: "900", textTransform: "uppercase", marginTop: 4 },
  dayGrid: { flexDirection: "row", gap: 6 },
  dayChip: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  dayChipText: { fontSize: 12, fontWeight: "900" },
  shiftRow: { flexDirection: "row", gap: 10 },
  shift: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  shiftText: { fontWeight: "900", fontSize: 14 },
  primaryAction: { borderRadius: 15, padding: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryActionText: { color: "#FFFFFF", fontWeight: "900", fontSize: 15 },
  quickGrid: { flexDirection: "row", gap: 10 },
  quickBtn: { flex: 1, borderRadius: 16, paddingVertical: 13, alignItems: "center", gap: 5, borderWidth: 1 },
  quickText: { fontWeight: "900", fontSize: 12 },
  alertRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderTopWidth: 1 },
  alertCopy: { flex: 1 },
  alertName: { fontSize: 14, fontWeight: "900" },
  alertMeta: { fontSize: 12, marginTop: 2, fontWeight: "700" },
  reminderBtn: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  transactionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: 1 },
  transactionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  transactionAmount: { fontSize: 13, fontWeight: "900" },
  insightRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  insightDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  insightText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  emptyText: { fontSize: 13, fontWeight: "700" },
  logout: { textAlign: "center", marginTop: 6, fontSize: 14, fontWeight: "800", opacity: 0.9 },
  skeletonLine: { height: 14, borderRadius: 999 },
  skeletonGrid: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  searchModalSafe: { flex: 1 },
  searchModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1 },
  searchModalTitle: { fontSize: 22, fontWeight: "900" },
  searchCloseBtn: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  searchModalContent: { flex: 1, padding: 16 },
  customerSearchShell: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, marginBottom: 10 },
  customerSearchInput: { flex: 1, paddingVertical: 13, fontSize: 14 },
  filterRow: { gap: 8, paddingBottom: 12 },
  filterChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  filterChipText: { fontSize: 12, fontWeight: "900", textTransform: "capitalize" },
  searchLoading: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 10 },
  searchLoadingText: { fontWeight: "800" },
  searchResultsList: { paddingBottom: 24 },
  searchEmpty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 10 },
  searchEmptyText: { fontWeight: "900" },
  searchCustomerRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, padding: 12, marginBottom: 10, borderWidth: 1 },
  searchCustomerBadge: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  searchCustomerBadgeText: { fontSize: 13, fontWeight: "900" },
  searchCustomerInfo: { flex: 1 },
  searchCustomerName: { fontSize: 15, fontWeight: "900" },
  searchCustomerMeta: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  searchCustomerPhone: { fontSize: 12, marginTop: 2 },
  statePill: { fontSize: 10, fontWeight: "900", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, overflow: "hidden", textTransform: "uppercase" },
});
