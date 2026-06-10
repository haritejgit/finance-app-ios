import { LinearGradient } from "expo-linear-gradient";
import { router, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
import { useAuth } from "../../src/auth-context";
import { AnimatedListItem } from "../../src/components/AnimatedListItem";
import { AnimatedScreen } from "../../src/components/AnimatedScreen";
import { CustomerIdBadge } from "../../src/components/CustomerIdBadge";
import { getDashboardAnalytics, subscribeDashboardAnalytics, type CustomerState, type DashboardAnalytics } from "../../src/finance-analytics";
import Icon from "../../src/Icon";
import { lightImpact } from "../../src/interactions";
import { CustomerSearchResult, getAllActiveCustomersWithVillages } from "../../src/repository";
import { Colors, Gradients } from "../../src/theme";
import { useTheme } from "../../src/theme-context";
import { useLanguage } from "../../src/language-context";
import { translateTelugu } from "../../src/exports";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const shortDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const shifts = ["Morning", "Evening"] as const;
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

function getGreeting(t: (key: string) => string) {
  const hour = new Date().getHours();
  if (hour < 12) return t("goodMorning");
  if (hour < 17) return t("goodAfternoon");
  return t("goodEvening");
}

function SkeletonLine({ width = "100%" }: { width?: number | `${number}%` }) {
  return <View style={[styles.skeletonLine, { width }]} />;
}

function DashboardSkeleton() {
  return (
    <View style={styles.skeletonPanel}>
      <SkeletonLine width="42%" />
      <SkeletonLine />
      <View style={styles.metricGrid}>
        <SkeletonLine width="48%" />
        <SkeletonLine width="48%" />
        <SkeletonLine width="48%" />
        <SkeletonLine width="48%" />
      </View>
      <SkeletonLine />
    </View>
  );
}

function DashboardPanel({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionCopy}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

function DashboardMetric({
  title,
  value,
  icon,
  tone,
  caption,
}: {
  title: string;
  value: string;
  icon: string;
  tone: string;
  caption: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.metricIcon, { backgroundColor: `${tone}18` }]}>
        <Icon name={icon} size={17} color={tone} />
      </View>
      <Text style={[styles.metricTitle, { color: colors.textSecondary }]}>{title}</Text>
      <Text style={[styles.metricValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      <Text style={[styles.metricCaption, { color: colors.textMuted }]}>{caption}</Text>
    </View>
  );
}

function MoneyMovementChart({ analytics }: { analytics: DashboardAnalytics }) {
  const { colors } = useTheme();
  const maxValue = Math.max(...analytics.weeklyTrend.map((item) => Math.max(item.collection, item.distribution)), 1);

  return (
    <View style={styles.chart}>
      {analytics.weeklyTrend.slice(-6).map((week) => (
        <View key={week.label} style={styles.chartColumn}>
          <View style={styles.chartBarWrap}>
            <View style={[styles.chartBar, styles.chartBarOut, { height: Math.max(8, (week.distribution / maxValue) * 116) }]} />
            <View style={[styles.chartBar, styles.chartBarIn, { height: Math.max(8, (week.collection / maxValue) * 116) }]} />
          </View>
          <Text style={[styles.chartLabel, { color: colors.textMuted }]}>{week.label}</Text>
        </View>
      ))}
    </View>
  );
}

function EmptyLine({ text }: { text: string }) {
  const { colors } = useTheme();
  return <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{text}</Text>;
}

function BottomNavButton({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.bottomNavButton, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}>
      <Icon name={icon} size={15} color={colors.primary} />
      <Text style={[styles.bottomNavText, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{label}</Text>
    </Pressable>
  );
}

export default function ShiftSelectionScreen() {
  const nav = useRouter();
  const { user, logout } = useAuth();
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const [selectedDay, setSelectedDay] = useState("Monday");
  const [selectedShift, setSelectedShift] = useState<Shift>("Morning");
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
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      setLoading(true);
      setAnalytics(await getDashboardAnalytics(user.uid));
    } catch (error) {
      console.error("Dashboard load failed", error);
      Alert.alert("Dashboard unavailable", "Could not load finance analytics. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const unsub = subscribeDashboardAnalytics(
      user.uid,
      (nextAnalytics) => {
        setAnalytics(nextAnalytics);
        setLoading(false);
        setRefreshing(false);
      },
      () => {
        loadDashboard();
      }
    );
    return unsub;
  }, [loadDashboard, user]);

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
  const bottomActions = useMemo(
    () => [
      { label: t("reports"), icon: "document-text-outline", action: () => nav.push("/reports") },
      { label: t("account"), icon: "wallet-outline", action: () => nav.push("/account") },
      { label: t("analytics"), icon: "bar-chart-outline", action: () => nav.push("/graph") },
      { label: t("history"), icon: "time-outline", action: () => nav.push("/history") },
      { label: t("settings"), icon: "settings-outline", action: () => nav.push("/settings") },
    ],
    [nav, t]
  );

  const startCollection = useCallback(() => {
    lightImpact();
    router.push({ pathname: "/village/[day]/[shift]", params: { day: selectedDay, shift: selectedShift } });
  }, [selectedDay, selectedShift]);

  const totals = analytics?.totals;
  const balance = (totals?.totalCollection ?? 0) - (totals?.pendingAmount ?? 0);
  const savings = (totals?.monthlyRevenue ?? 0) - (totals?.distributedThisMonth ?? 0);
  const dueAlerts = analytics?.dueAlerts ?? [];

  const activeRouteKey = `${selectedDay}:${selectedShift}`;
  const routeProgress = analytics?.routeProgresses?.[activeRouteKey] ?? {
    target: 0,
    collected: 0,
    dueAmount: 0,
    customerCount: 0,
    paidCustomerCount: 0,
    dueCustomerCount: 0,
  };
  const paidPercent = routeProgress.customerCount > 0 ? Math.min(100, Math.round((routeProgress.paidCustomerCount / routeProgress.customerCount) * 100)) : 0;
  const duePercent = routeProgress.customerCount > 0 ? Math.min(100 - paidPercent, Math.round((routeProgress.dueCustomerCount / routeProgress.customerCount) * 100)) : 0;
  const progressPercent = Math.min(100, paidPercent + duePercent);
  const remainingTarget = Math.max(0, routeProgress.target - routeProgress.collected - routeProgress.dueAmount);
  const remainingCustomers = Math.max(0, routeProgress.customerCount - routeProgress.paidCustomerCount - routeProgress.dueCustomerCount);

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
              <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                <View style={styles.headerTop}>
                  <View style={styles.brandRow}>
                    <View style={[styles.brandIcon, { backgroundColor: colors.primarySoft }]}>
                      <Icon name="wallet-outline" size={19} color={colors.primary} />
                    </View>
                    <View style={styles.headerCopy}>
                      <Text style={[styles.eyebrow, { color: colors.textMuted }]}>{t("premiumWorkspace")}</Text>
                      <Text style={[styles.header, { color: colors.text }]}>{t("financeDashboard")}</Text>
                      <Text style={[styles.welcome, { color: colors.textSecondary }]}>{getGreeting(t)}, {displayName} | {todayLabel}</Text>
                    </View>
                  </View>
                  <Pressable accessibilityLabel={t("searchCustomers")} style={styles.searchButton} onPress={openCustomerSearch}>
                    <Icon name="search" size={20} color="#FFFFFF" />
                  </Pressable>
                </View>

                <Pressable style={[styles.todayCard, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]} onPress={() => nav.push("/graph")}>
                  <View style={[styles.todayIcon, { backgroundColor: colors.warningSoft }]}>
                    <Icon name="cash-outline" size={18} color={colors.amberGlow} />
                  </View>
                  <View style={styles.todayCopy}>
                    <Text style={[styles.todayLabel, { color: colors.textSecondary }]}>{t("collectedToday")}</Text>
                    <Text style={[styles.todayValue, { color: colors.text }]}>{formatMoney(totals?.collectionToday ?? 0)}</Text>
                    <Text style={[styles.todayHint, { color: colors.textSecondary }]}>{t("distributedTodayHint")} {formatMoney(totals?.distributedToday ?? 0)}</Text>
                  </View>
                </Pressable>
              </View>

              {loading && !analytics ? (
                <DashboardSkeleton />
              ) : (
                <>
                  <DashboardPanel
                    title={t("collectionRoute")}
                    action={<Text style={[styles.routeMeta, { color: colors.textMuted }]}>{selectedDay} / {selectedShift}</Text>}
                  >
                    <Text style={[styles.controlLabel, { color: colors.textSecondary }]}>{t("day")}</Text>
                    <View style={styles.dayGrid}>
                      {days.map((day, index) => (
                        <Pressable
                           key={day}
                           accessibilityLabel={`Select ${day}`}
                           onPress={() => {
                             lightImpact();
                             setSelectedDay(day);
                           }}
                           style={[styles.dayChip, { backgroundColor: colors.surfaceTint, borderColor: colors.border }, selectedDay === day && styles.dayChipOn]}
                        >
                          <Text style={[styles.dayChipText, { color: colors.text }, selectedDay === day && styles.dayChipTextOn]}>{shortDays[index]}</Text>
                        </Pressable>
                      ))}
                    </View>

                    <Text style={[styles.controlLabel, { color: colors.textSecondary }]}>{t("shift")}</Text>
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
                            style={[styles.shift, { backgroundColor: colors.surfaceTint, borderColor: colors.border }, active && styles.shiftOn]}
                          >
                            <Icon name={shift === "Morning" ? "sunny-outline" : "moon-outline"} size={17} color={active ? Colors.nearBlack : colors.primary} />
                            <Text style={[styles.shiftText, { color: colors.primary }, active && styles.shiftTextOn]}>{shift}</Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {routeProgress.customerCount > 0 && (
                      <View style={[styles.progressCard, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
                        <View style={styles.progressHeader}>
                          <Text style={[styles.progressTitle, { color: colors.text }]}>
                            {selectedDay} {selectedShift === "Morning" ? "☀️" : "🌙"} Route Progress
                          </Text>
                          <Text style={[styles.progressPercentText, { color: colors.primary }]}>{progressPercent}%</Text>
                        </View>
                        <View style={[styles.progressBarBg, { backgroundColor: colors.border, flexDirection: "row", overflow: "hidden" }]}>
                          {paidPercent > 0 && (
                            <View
                              style={[
                                styles.progressBarFill,
                                {
                                  width: `${paidPercent}%`,
                                  backgroundColor: "#ff9f1c", // Orange
                                  borderRadius: 0,
                                },
                              ]}
                            />
                          )}
                          {duePercent > 0 && (
                            <View
                              style={[
                                styles.progressBarFill,
                                {
                                  width: `${duePercent}%`,
                                  backgroundColor: "#d94841", // Red
                                  borderRadius: 0,
                                },
                              ]}
                            />
                          )}
                        </View>
                        <View style={styles.progressDetails}>
                          <Text style={[styles.progressDetailText, { color: colors.textSecondary }]}>
                            Paid: <Text style={{fontWeight: "900", color: "#ff9f1c"}}>{formatMoney(routeProgress.collected)}</Text>
                            {routeProgress.dueAmount > 0 && (
                              <> • Dues: <Text style={{fontWeight: "900", color: "#d94841"}}>{formatMoney(routeProgress.dueAmount)}</Text></>
                            )}
                            {" "}/ {formatMoney(routeProgress.target)}
                          </Text>
                          {remainingCustomers > 0 ? (
                            <Text style={[styles.progressHintText, { color: colors.amberGlow }]}>
                              Rs. {Math.round(remainingTarget).toLocaleString("en-IN")} left • {remainingCustomers} customer{remainingCustomers === 1 ? "" : "s"} remaining
                            </Text>
                          ) : (
                            <Text style={[styles.progressHintText, {color: "#16803a", fontWeight: "900"}]}>
                              🎉 Route Visited! {routeProgress.paidCustomerCount} Paid • {routeProgress.dueCustomerCount} Dues
                            </Text>
                          )}
                        </View>
                      </View>
                    )}

                    <Pressable accessibilityLabel={t("startCollection")} onPress={startCollection}>
                      <LinearGradient colors={Gradients.ctaButton} style={styles.primaryAction}>
                        <Text style={styles.primaryActionText}>{t("startCollection")}</Text>
                        <Icon name="arrow-forward" size={18} color={Colors.nearBlack} />
                      </LinearGradient>
                    </Pressable>

                    <View style={styles.walletRouteSummary}>
                      <Text style={[styles.walletRouteText, { color: colors.textSecondary }]}>Cash: {formatMoney(totals?.cashWalletBalance ?? 0)}</Text>
                      <View style={[styles.walletRouteDot, { backgroundColor: colors.border }]} />
                      <Text style={[styles.walletRouteText, { color: colors.textSecondary }]}>PhonePe: {formatMoney(totals?.phonePeWalletBalance ?? 0)}</Text>
                    </View>
                  </DashboardPanel>

                  <View style={styles.metricGrid}>
                    <DashboardMetric title={t("balance")} value={formatMoney(balance)} caption={t("collectedMinusPending")} icon="wallet-outline" tone="#FFFFFF" />
                    <DashboardMetric title={t("income")} value={formatMoney(totals?.monthlyRevenue ?? 0)} caption={t("collectedThisMonth")} icon="cash-outline" tone={Colors.lightSeaGreen} />
                    <DashboardMetric title={t("expense")} value={formatMoney(totals?.distributedThisMonth ?? 0)} caption={t("distributedThisMonth")} icon="trending-up-outline" tone={Colors.amberGlow} />
                    <DashboardMetric title={t("savings")} value={formatMoney(savings)} caption={t("needsRecoveryFocus")} icon="alert-circle-outline" tone={Colors.danger} />
                  </View>

                  {analytics ? (
                    <>
                      <DashboardPanel
                        title={t("monthlyOverview")}
                        subtitle={t("collectedVsDistributedByWeek")}
                        action={
                          <View style={styles.legend}>
                            <View style={[styles.legendDot, { backgroundColor: Colors.lightSeaGreen }]} />
                            <Text style={styles.legendText}>{t("in")}</Text>
                            <View style={[styles.legendDot, { backgroundColor: Colors.amberGlow }]} />
                            <Text style={styles.legendText}>{t("out")}</Text>
                          </View>
                        }
                      >
                        <MoneyMovementChart analytics={analytics} />
                      </DashboardPanel>

                      <DashboardPanel
                        title={t("smartInsights")}
                        subtitle={t("alertsFromTransactions")}
                        action={
                          <View style={styles.panelIcon}>
                            <Icon name="sparkles-outline" size={18} color={Colors.nearBlack} />
                          </View>
                        }
                      >
                        {analytics.insights.concat(analytics.aiInsights).slice(0, 4).map((insight) => (
                          <View key={insight} style={styles.insightRow}>
                            <View style={styles.insightDot} />
                            <Text style={styles.insightText}>{insight}</Text>
                          </View>
                        ))}
                      </DashboardPanel>

                      <DashboardPanel
                        title={t("recentTransactions")}
                        subtitle={t("latestCollections")}
                        action={
                          <Pressable style={styles.csvButton} onPress={() => nav.push("/reports")}>
                            <Icon name="download-outline" size={14} color={Colors.nearBlack} />
                            <Text style={styles.csvText}>CSV</Text>
                          </Pressable>
                        }
                      >
                        {analytics.recentTransactions.length ? (
                          analytics.recentTransactions.slice(0, 5).map((item) => (
                            <Pressable
                              key={item.id}
                              style={styles.transactionRow}
                              onPress={() => item.customerId && router.push(`/profile/${item.customerId}`)}
                            >
                              <View style={styles.transactionIcon}>
                                <Icon name="cash-outline" size={15} color={Colors.nearBlack} />
                              </View>
                              <View style={styles.rowCopy}>
                                <Text style={styles.rowTitle}>{item.customerName}</Text>
                                <Text style={styles.rowMeta}>
                                  {item.villageName} / {new Date(item.paymentDate).toLocaleDateString("en-IN")}
                                </Text>
                              </View>
                              <Text style={styles.transactionAmount}>{formatMoney(item.amountPaid)}</Text>
                            </Pressable>
                          ))
                        ) : (
                          <EmptyLine text="Collections will appear here after payments are recorded." />
                        )}
                      </DashboardPanel>
                    </>
                  ) : null}

                  <DashboardPanel
                    title={t("budgetAlerts")}
                    subtitle={t("customersNeedingFollowup")}
                    action={<Text style={styles.alertBadge}>{dueAlerts.length} {t("active")}</Text>}
                  >
                    {dueAlerts.length ? (
                      dueAlerts.slice(0, 4).map((alert) => (
                        <Pressable
                          key={alert.customerId}
                          style={styles.alertRow}
                          onPress={() => router.push(`/profile/${alert.customerId}`)}
                        >
                          <View style={styles.alertIcon}>
                            <Icon name="alert-circle-outline" size={15} color="#FFFFFF" />
                          </View>
                          <View style={styles.rowCopy}>
                            <Text style={styles.rowTitle}>{alert.customerName}</Text>
                            <Text style={styles.rowMeta}>
                              {alert.villageName} / {alert.dueCount} due / {formatMoney(alert.dueAmount)}
                            </Text>
                          </View>
                          <Icon name="warning" size={16} color="#94A3B8" />
                        </Pressable>
                      ))
                    ) : (
                      <EmptyLine text={analytics ? "No active budget alerts right now." : "Sign in to load customer follow-up alerts."} />
                    )}
                  </DashboardPanel>

                  <View style={styles.bottomNav}>
                    {bottomActions.map((item) => (
                      <BottomNavButton
                        key={item.label}
                        label={item.label}
                        icon={item.icon}
                        onPress={() => {
                          lightImpact();
                          item.action();
                        }}
                      />
                    ))}
                  </View>

                  <Pressable
                    style={styles.logoutLink}
                    onPress={async () => {
                      lightImpact();
                      await logout();
                      router.replace("/login");
                    }}
                  >
                    <Text style={styles.logoutText}>{t("logout")}</Text>
                  </Pressable>
                </>
              )}
            </Animated.View>
          </ScrollView>
        </SafeAreaView>

        <Modal visible={searchOpen} animationType="slide" onRequestClose={() => setSearchOpen(false)}>
          <SafeAreaView style={[styles.searchModalSafe, { backgroundColor: colors.background }]}>
            <View style={[styles.searchModalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              <Text style={[styles.searchModalTitle, { color: colors.text }]}>{t("smartCustomerSearch")}</Text>
              <Pressable style={[styles.searchCloseBtn, { backgroundColor: colors.surfaceTint }]} onPress={() => setSearchOpen(false)}>
                <Icon name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
            <View style={styles.searchModalContent}>
              <View style={[styles.customerSearchShell, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
                <Icon name="search" size={18} color={colors.textSecondary} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={t("searchPlaceholder")}
                  placeholderTextColor={colors.textMuted}
                  style={[styles.customerSearchInput, { color: colors.text }]}
                  autoFocus
                />
              </View>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                style={{ flexGrow: 0, marginBottom: 8 }}
                contentContainerStyle={styles.filterRow}
              >
                {filters.map((filter) => {
                  const active = customerFilter === filter.key;
                  return (
                    <Pressable
                      key={filter.key}
                      onPress={() => {
                        lightImpact();
                        setCustomerFilter(filter.key);
                      }}
                      style={[styles.filterChip, { backgroundColor: colors.card, borderColor: colors.border }, active && styles.filterChipOn]}
                    >
                      <Text style={[styles.filterChipText, { color: colors.textSecondary }, active && styles.filterChipTextOn]}>
                        {t(filter.key === "paid" ? "paidToday" : filter.key)}
                      </Text>
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
                      <Text style={styles.searchEmptyText}>{t("noCustomersFound")}</Text>
                    </View>
                  }
                  renderItem={({ item, index }) => {
                    const state = analytics?.customerStates[item.id] ?? "pending";
                    return (
                      <AnimatedListItem index={index}>
                        <Pressable
                          style={[styles.searchCustomerRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                          onPress={() => {
                            lightImpact();
                            setSearchOpen(false);
                            setSearchQuery("");
                            router.push(`/profile/${item.id}`);
                          }}
                        >
                          <CustomerIdBadge numericalId={item.numericalId} id={item.id} />
                          <View style={styles.searchCustomerInfo}>
                            <Text style={[styles.searchCustomerName, { color: colors.text }]}>
                              {language === "te" ? translateTelugu(item.name) : item.name}
                            </Text>
                            <Text style={[styles.searchCustomerMeta, { color: colors.textSecondary }]}>
                              {item.villageName || "No village"} | {item.villageDayOfWeek || "-"} {item.villageShift || ""}
                            </Text>
                            <Text style={[styles.searchCustomerPhone, { color: colors.textMuted }]}>{item.phone}</Text>
                          </View>
                          <Text style={[styles.statePill, { backgroundColor: colors.primarySoft, color: colors.primary }]}>{state}</Text>
                        </Pressable>
                      </AnimatedListItem>
                    );
                  }}
                />
              )}
            </View>
          </SafeAreaView>
        </Modal>

        <Pressable
          accessibilityLabel="Open AI Business Advisor"
          style={styles.aiFab}
          onPress={() => {
            lightImpact();
            nav.push("/ai-advisor" as any);
          }}
        >
          <Icon name="sparkles-outline" size={24} color="#FFFFFF" />
        </Pressable>
      </LinearGradient>
    </AnimatedScreen>
  );
}

const screenWidth = Dimensions.get("window").width;

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  container: { paddingHorizontal: 18, paddingVertical: 12, paddingBottom: 36 },
  content: { width: "100%", maxWidth: Math.min(screenWidth - 36, 920), alignSelf: "center", gap: 12 },
  headerCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 14,
    gap: 12,
    shadowColor: Colors.lightSeaGreen,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 5,
  },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  brandRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  brandIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: Colors.frozenWater, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  eyebrow: { color: Colors.textMuted, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  header: { color: Colors.nearBlack, fontSize: 22, lineHeight: 27, fontWeight: "900" },
  welcome: { color: "#426c67", fontSize: 12, marginTop: 2, fontWeight: "800" },
  searchButton: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: Colors.lightSeaGreen },
  todayCard: { minHeight: 74, borderRadius: 14, backgroundColor: "#f6fffe", flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: Colors.borderLight },
  todayIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.honeyBronze, alignItems: "center", justifyContent: "center" },
  todayCopy: { flex: 1 },
  todayLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  todayValue: { color: Colors.nearBlack, fontSize: 27, lineHeight: 31, fontWeight: "900" },
  todayHint: { color: "#426c67", fontSize: 11, fontWeight: "800" },
  panel: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 14,
    gap: 12,
    shadowColor: Colors.lightSeaGreen,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  sectionCopy: { flex: 1 },
  sectionTitle: { color: Colors.nearBlack, fontSize: 19, lineHeight: 23, fontWeight: "900" },
  sectionSub: { color: Colors.textMuted, fontSize: 11, fontWeight: "800", marginTop: 1 },
  routeMeta: { color: Colors.textMuted, fontSize: 11, fontWeight: "900" },
  controlLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  dayGrid: { flexDirection: "row", gap: 6 },
  dayChip: { flex: 1, borderWidth: 1, borderColor: Colors.borderLight, borderRadius: 11, paddingVertical: 10, alignItems: "center", backgroundColor: "#f6fffe", minWidth: 38 },
  dayChipOn: { backgroundColor: Colors.amberGlow, borderColor: Colors.amberGlow },
  dayChipText: { color: Colors.nearBlack, fontSize: 12, fontWeight: "900" },
  dayChipTextOn: { color: Colors.white },
  shiftRow: { flexDirection: "row", gap: 8 },
  shift: { flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: "#f6fffe", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, paddingHorizontal: 8 },
  shiftOn: { backgroundColor: Colors.amberGlow, borderColor: Colors.amberGlow },
  shiftText: { color: Colors.lightSeaGreen, fontWeight: "900", fontSize: 13 },
  shiftTextOn: { color: Colors.white },
  primaryAction: { borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryActionText: { color: Colors.nearBlack, fontWeight: "900", fontSize: 15 },
  walletRouteSummary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 2 },
  walletRouteText: { color: Colors.textMuted, fontSize: 11, fontWeight: "800" },
  walletRouteDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.borderLight },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: { flexGrow: 1, flexBasis: "47%", minWidth: 150, minHeight: 116, borderRadius: 16, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight, padding: 13 },
  metricIcon: { width: 33, height: 33, borderRadius: 11, alignItems: "center", justifyContent: "center", marginBottom: 9 },
  metricTitle: { color: Colors.textMuted, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  metricValue: { color: Colors.nearBlack, fontSize: 21, lineHeight: 26, fontWeight: "900", marginTop: 3 },
  metricCaption: { color: Colors.textMuted, fontSize: 11, fontWeight: "800", marginTop: 2 },
  legend: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: Colors.textMuted, fontSize: 10, fontWeight: "900" },
  chart: { height: 142, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10, paddingTop: 2 },
  chartColumn: { flex: 1, alignItems: "center", gap: 6 },
  chartBarWrap: { height: 116, flexDirection: "row", alignItems: "flex-end", gap: 5 },
  chartBar: { width: 10, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  chartBarOut: { backgroundColor: Colors.amberGlow },
  chartBarIn: { backgroundColor: Colors.lightSeaGreen },
  chartLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: "900" },
  panelIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: Colors.frozenWater, alignItems: "center", justifyContent: "center" },
  insightRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  insightDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.amberGlow, marginTop: 5 },
  insightText: { flex: 1, color: "#426c67", fontSize: 13, lineHeight: 19, fontWeight: "800" },
  csvButton: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, backgroundColor: Colors.frozenWater, paddingHorizontal: 10, paddingVertical: 7 },
  csvText: { color: Colors.lightSeaGreen, fontSize: 10, fontWeight: "900" },
  transactionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  transactionIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: Colors.frozenWater, alignItems: "center", justifyContent: "center" },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: Colors.nearBlack, fontSize: 14, fontWeight: "900" },
  rowMeta: { color: Colors.textMuted, fontSize: 12, fontWeight: "800", marginTop: 2 },
  transactionAmount: { color: Colors.lightSeaGreen, fontSize: 13, fontWeight: "900" },
  alertBadge: { overflow: "hidden", borderRadius: 999, backgroundColor: "#fde7e5", color: Colors.danger, paddingHorizontal: 10, paddingVertical: 6, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  alertRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  alertIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: Colors.danger, alignItems: "center", justifyContent: "center" },
  emptyText: { color: Colors.textMuted, fontSize: 13, fontWeight: "800", paddingVertical: 12 },
  bottomNav: { flexDirection: "row", gap: 5, paddingHorizontal: 2 },
  bottomNavButton: { flex: 1, minHeight: 52, borderRadius: 12, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight, alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: 2, paddingVertical: 4 },
  bottomNavText: { color: Colors.nearBlack, fontSize: 10, fontWeight: "900", textAlign: "center" },
  progressCard: { backgroundColor: "#fafbfc", borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: Colors.borderLight },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  progressTitle: { fontSize: 12, fontWeight: "900", color: Colors.nearBlack },
  progressPercentText: { fontSize: 13, fontWeight: "900", color: Colors.lightSeaGreen },
  progressBarBg: { height: 8, backgroundColor: "#e2e8f0", borderRadius: 4, overflow: "hidden", marginBottom: 8 },
  progressBarFill: { height: "100%", borderRadius: 4 },
  progressDetails: { gap: 2 },
  progressDetailText: { fontSize: 11, fontWeight: "800", color: Colors.textMuted },
  progressHintText: { fontSize: 10, fontWeight: "800", color: Colors.amberGlow },
  logoutLink: { alignItems: "center", paddingVertical: 8 },
  logoutText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
  skeletonPanel: { backgroundColor: Colors.white, borderRadius: 18, borderWidth: 1, borderColor: Colors.borderLight, padding: 16, gap: 14 },
  skeletonLine: { height: 16, borderRadius: 999, backgroundColor: "#DCE6F7" },
  searchModalSafe: { flex: 1 },
  searchModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 14, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#DCE6F7" },
  searchModalTitle: { color: "#111827", fontSize: 22, fontWeight: "700" },
  searchCloseBtn: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
  searchModalContent: { flex: 1, padding: 16 },
  customerSearchShell: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, borderWidth: 1, borderColor: "#DCE6F7", backgroundColor: "#FFFFFF", paddingHorizontal: 12, marginBottom: 10 },
  customerSearchInput: { flex: 1, paddingVertical: 13, fontSize: 15, color: "#111827" },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 6 },
  filterChip: { borderRadius: 999, borderWidth: 1, borderColor: "#DCE6F7", paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#FFFFFF" },
  filterChipOn: { backgroundColor: Colors.lightSeaGreen, borderColor: Colors.lightSeaGreen },
  filterChipText: { color: "#6B7280", fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  filterChipTextOn: { color: "#FFFFFF" },
  searchLoading: { paddingVertical: 30, gap: 12 },
  searchResultsList: { paddingBottom: 24 },
  searchEmpty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 10 },
  searchEmptyText: { color: "#6B7280", fontWeight: "700" },
  searchCustomerRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "#DCE6F7", backgroundColor: "#FFFFFF" },
  searchCustomerInfo: { flex: 1 },
  searchCustomerName: { color: "#111827", fontSize: 15, fontWeight: "700" },
  searchCustomerMeta: { color: "#6B7280", fontSize: 12, fontWeight: "500", marginTop: 2 },
  searchCustomerPhone: { color: "#9CA3AF", fontSize: 12, marginTop: 2 },
  statePill: { color: Colors.lightSeaGreen, backgroundColor: Colors.frozenWater, fontSize: 10, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, overflow: "hidden", textTransform: "uppercase" },
  aiFab: { position: "absolute", right: 18, bottom: 24, width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", backgroundColor: Colors.amberGlow, shadowColor: Colors.amberGlow, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 8 },
});
