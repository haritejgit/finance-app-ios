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
} from "../src/repository";
import { getDashboardAnalytics, type CustomerState, type DashboardAnalytics } from "../src/finance-analytics";
import { getGradient } from "../src/theme";
import { useTheme } from "../src/theme-context";
import Icon from "../src/Icon";
import { downloadTextFile } from "../src/exports";

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
  const [dailyFocus, setDailyFocus] = useState<"collection" | "distribution">("collection");
  const intro = useRef(new Animated.Value(0)).current;
  const dailyPulse = useRef(new Animated.Value(1)).current;

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

  const dailyMetric = useMemo(() => {
    const collection = analytics?.totals.collectionToday ?? 0;
    const distribution = analytics?.totals.distributedToday ?? 0;
    const current = dailyFocus === "collection" ? collection : distribution;
    const alternate = dailyFocus === "collection" ? distribution : collection;
    return {
      label: dailyFocus === "collection" ? "Collected today" : "Distributed today",
      value: current,
      alternateLabel: dailyFocus === "collection" ? "distributed today" : "collected today",
      alternateValue: alternate,
      icon: dailyFocus === "collection" ? "cash-outline" : "trending-up-outline",
    };
  }, [analytics?.totals.collectionToday, analytics?.totals.distributedToday, dailyFocus]);

  const savingsToday = useMemo(() => {
    if (!analytics) return 0;
    return analytics.totals.collectionToday - analytics.totals.distributedToday;
  }, [analytics]);

  const monthlyNet = useMemo(() => {
    if (!analytics) return 0;
    return analytics.totals.monthlyRevenue - analytics.totals.distributedThisMonth;
  }, [analytics]);

  const toggleDailyFocus = useCallback(() => {
    setDailyFocus((value) => (value === "collection" ? "distribution" : "collection"));
    dailyPulse.setValue(0.96);
    Animated.spring(dailyPulse, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
      tension: 140,
    }).start();
  }, [dailyPulse]);

  const exportRecentCsv = useCallback(() => {
    const recentTransactions = analytics?.recentTransactions ?? [];
    if (!recentTransactions.length) {
      Alert.alert("No transactions", "Recent transactions will be available to export after payments are recorded.");
      return;
    }
    const rows = [
      ["Date", "Customer", "Village", "Amount", "Mode", "Type"],
      ...recentTransactions.map((item) => [
        new Date(item.paymentDate).toLocaleDateString(),
        item.customerName,
        item.villageName,
        String(item.amountPaid),
        item.paymentMode,
        item.paymentType,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const exported = downloadTextFile(`recent-transactions-${Date.now()}.csv`, csv, "text/csv");
    if (!exported) Alert.alert("Web only", "CSV export is available from the web dashboard.");
  }, [analytics?.recentTransactions]);

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
              <Pressable onPress={toggleDailyFocus} disabled={loading} accessibilityRole="button" accessibilityLabel={`Show ${dailyMetric.alternateLabel}`}>
                <Animated.View
                  style={[
                    styles.heroMetricPanel,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      transform: [{ scale: dailyPulse }],
                    },
                  ]}
                >
                  <View style={[styles.heroMetricIcon, { backgroundColor: colors.primarySoft }]}>
                    <Icon name={dailyMetric.icon} size={20} color={colors.primary} />
                  </View>
                  <View style={styles.heroMetricCopy}>
                    <Text style={[styles.heroMetricLabel, { color: colors.textSecondary }]}>{dailyMetric.label}</Text>
                    <Text style={[styles.heroMetricValue, { color: colors.text }]}>
                      {loading ? "..." : formatMoney(dailyMetric.value)}
                    </Text>
                    <Text style={[styles.heroMetricHint, { color: colors.textMuted }]}>
                      Tap to see {dailyMetric.alternateLabel}: {loading ? "..." : formatMoney(dailyMetric.alternateValue)}
                    </Text>
                  </View>
                  <View style={[styles.deltaPill, { backgroundColor: savingsToday >= 0 ? colors.successSoft : colors.destructiveSoft }]}>
                    <Icon name={savingsToday >= 0 ? "arrow-up" : "arrow-down"} size={13} color={savingsToday >= 0 ? colors.success : colors.error} />
                    <Text style={[styles.deltaPillText, { color: savingsToday >= 0 ? colors.success : colors.error }]}>
                      {formatMoney(Math.abs(savingsToday))}
                    </Text>
                  </View>
                </Animated.View>
              </Pressable>
            </View>

            <View style={[styles.panel, styles.routePanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
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

            {loading && !analytics ? (
              <DashboardSkeleton />
            ) : (
              <>
                <View style={styles.metricsGrid}>
                  {[
                    {
                      title: "Balance",
                      value: formatMoney((analytics?.totals.totalCollection ?? 0) - (analytics?.totals.pendingAmount ?? 0)),
                      detail: "Collected minus pending",
                      icon: "wallet-outline",
                      tone: colors.primary,
                      soft: colors.primarySoft,
                    },
                    {
                      title: "Income",
                      value: formatMoney(analytics?.totals.monthlyRevenue ?? 0),
                      detail: "Collected this month",
                      icon: "cash-outline",
                      tone: colors.success,
                      soft: colors.successSoft,
                    },
                    {
                      title: "Expense",
                      value: formatMoney(analytics?.totals.distributedThisMonth ?? 0),
                      detail: "Distributed this month",
                      icon: "trending-up-outline",
                      tone: colors.warning,
                      soft: colors.warningSoft,
                    },
                    {
                      title: "Savings",
                      value: formatMoney(monthlyNet),
                      detail: monthlyNet >= 0 ? "Positive monthly net" : "Needs recovery focus",
                      icon: monthlyNet >= 0 ? "shield-checkmark-outline" : "alert-circle-outline",
                      tone: monthlyNet >= 0 ? colors.teal : colors.error,
                      soft: monthlyNet >= 0 ? colors.successSoft : colors.destructiveSoft,
                    },
                  ].map((metric) => (
                    <View key={metric.title} style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={[styles.metricIcon, { backgroundColor: metric.soft }]}>
                        <Icon name={metric.icon} size={18} color={metric.tone} />
                      </View>
                      <Text style={[styles.metricTitle, { color: colors.textSecondary }]}>{metric.title}</Text>
                      <Text style={[styles.metricValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                        {metric.value}
                      </Text>
                      <Text style={[styles.metricDetail, { color: colors.textMuted }]}>{metric.detail}</Text>
                    </View>
                  ))}
                </View>

                <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={[styles.sectionTitleDark, { color: colors.text }]}>Monthly Overview</Text>
                      <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>Collected vs distributed by week</Text>
                    </View>
                    <View style={styles.legendRow}>
                      <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                      <Text style={[styles.legendText, { color: colors.textMuted }]}>In</Text>
                      <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
                      <Text style={[styles.legendText, { color: colors.textMuted }]}>Out</Text>
                    </View>
                  </View>
                  <View style={styles.chartWrap}>
                    {(analytics?.weeklyTrend ?? []).slice(-6).map((week) => {
                      const maxValue = Math.max(
                        ...(analytics?.weeklyTrend ?? []).map((item) => Math.max(item.collection, item.distribution)),
                        1
                      );
                      return (
                        <View key={week.label} style={styles.chartColumn}>
                          <View style={styles.chartBars}>
                            <View style={[styles.chartBar, { height: Math.max(6, (week.distribution / maxValue) * 112), backgroundColor: colors.warning }]} />
                            <View style={[styles.chartBar, styles.chartBarCollection, { height: Math.max(6, (week.collection / maxValue) * 124), backgroundColor: colors.primary }]} />
                          </View>
                          <Text style={[styles.chartLabel, { color: colors.textMuted }]}>{week.label}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>

                <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={[styles.sectionTitleDark, { color: colors.text }]}>Smart Insights</Text>
                      <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>Alerts generated from existing transactions</Text>
                    </View>
                    <View style={[styles.sectionIcon, { backgroundColor: colors.primarySoft }]}>
                      <Icon name="sparkles-outline" size={17} color={colors.primary} />
                    </View>
                  </View>
                  {(analytics?.insights ?? []).concat(analytics?.aiInsights ?? []).slice(0, 4).map((insight) => (
                    <View key={insight} style={styles.insightRow}>
                      <View style={[styles.insightDot, { backgroundColor: colors.primary }]} />
                      <Text style={[styles.insightText, { color: colors.textSecondary }]}>{insight}</Text>
                    </View>
                  ))}
                </View>

                <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={[styles.sectionTitleDark, { color: colors.text }]}>Recent Transactions</Text>
                      <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>Latest collections across routes</Text>
                    </View>
                    <Pressable style={[styles.exportCsvBtn, { backgroundColor: colors.primarySoft }]} onPress={exportRecentCsv}>
                      <Icon name="download-outline" size={16} color={colors.primary} />
                      <Text style={[styles.exportCsvText, { color: colors.primary }]}>CSV</Text>
                    </Pressable>
                  </View>
                  {analytics?.recentTransactions.length ? (
                    analytics.recentTransactions.slice(0, 5).map((item) => (
                      <Pressable
                        key={item.id}
                        style={[styles.transactionRow, { borderTopColor: colors.border }]}
                        onPress={() => item.customerId && router.push(`/profile/${item.customerId}`)}
                      >
                        <View style={[styles.transactionIcon, { backgroundColor: colors.successSoft }]}>
                          <Icon name={item.paymentMode === "PHONE" ? "phone-portrait-outline" : "cash-outline"} size={16} color={colors.success} />
                        </View>
                        <View style={styles.alertCopy}>
                          <Text style={[styles.alertName, { color: colors.text }]}>{item.customerName}</Text>
                          <Text style={[styles.alertMeta, { color: colors.textSecondary }]}>
                            {item.villageName} / {new Date(item.paymentDate).toLocaleDateString()}
                          </Text>
                        </View>
                        <Text style={[styles.transactionAmount, { color: colors.success }]}>{formatMoney(item.amountPaid)}</Text>
                      </Pressable>
                    ))
                  ) : (
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>New collections will appear here automatically.</Text>
                  )}
                </View>

                <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={[styles.sectionTitleDark, { color: colors.text }]}>Budget Alerts</Text>
                      <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>Customers needing follow-up</Text>
                    </View>
                    <Text style={[styles.statePill, { color: colors.error, backgroundColor: colors.destructiveSoft }]}>
                      {analytics?.dueAlerts.length ?? 0} active
                    </Text>
                  </View>
                  {analytics?.dueAlerts.length ? (
                    analytics.dueAlerts.slice(0, 4).map((alert) => (
                      <Pressable
                        key={alert.customerId}
                        style={[styles.alertRow, { borderTopColor: colors.border }]}
                        onPress={() => router.push(`/profile/${alert.customerId}`)}
                      >
                        <View style={[styles.transactionIcon, { backgroundColor: colors.destructiveSoft }]}>
                          <Icon name="alert-circle-outline" size={16} color={colors.error} />
                        </View>
                        <View style={styles.alertCopy}>
                          <Text style={[styles.alertName, { color: colors.text }]}>{alert.customerName}</Text>
                          <Text style={[styles.alertMeta, { color: colors.textSecondary }]}>
                            {alert.villageName} / {alert.dueCount} due / {formatMoney(alert.dueAmount)}
                          </Text>
                        </View>
                        <Icon name="chevron-forward" size={16} color={colors.textMuted} />
                      </Pressable>
                    ))
                  ) : (
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No overdue pattern is visible right now.</Text>
                  )}
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
  heroMetricPanel: { flexDirection: "row", alignItems: "center", borderRadius: 18, borderWidth: 1, padding: 14, gap: 12 },
  heroMetricIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  heroMetricCopy: { flex: 1, minWidth: 0 },
  heroMetricLabel: { fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  heroMetricValue: { fontSize: 34, fontWeight: "900", marginTop: 2 },
  heroMetricHint: { fontSize: 11, fontWeight: "800", marginTop: 3 },
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
  exportCsvBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  exportCsvText: { fontSize: 11, fontWeight: "900" },
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
