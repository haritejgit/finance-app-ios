import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db } from "../../src/firebase";
import { collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
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
import { useAuth } from "../../src/auth-context";
import { AnimatedListItem } from "../../src/components/AnimatedListItem";
import { AnimatedScreen } from "../../src/components/AnimatedScreen";
import { CustomerIdBadge } from "../../src/components/CustomerIdBadge";

import { getDashboardAnalytics, subscribeDashboardAnalytics, type CustomerState, type DashboardAnalytics } from "../../src/finance-analytics";
import Icon from "../../src/Icon";
import { lightImpact } from "../../src/interactions";
import { CustomerSearchResult, getAllActiveCustomersWithVillages, runRetroactiveCleanup, addNestedExpense, updateNestedExpense, deleteNestedExpense, type NestedExpense } from "../../src/repository";
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
  const { user, userProfile, logout } = useAuth();
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

  const logDebug = useCallback(async (message: string, extra: any = {}) => {
    try {
      const { addDoc, collection } = await import("firebase/firestore");
      await addDoc(collection(db, "debugLogs"), {
        timestamp: Date.now(),
        message,
        ...extra
      });
    } catch (e) {
      console.error("Failed to write debug log", e);
    }
  }, []);

  const isOwner = !userProfile || userProfile.role !== "nested";
  const effectiveOwnerId = isOwner ? user?.uid : userProfile?.parentUid;

  const [nestedActivity, setNestedActivity] = useState<any[]>([]);
  const [nestedAccounts, setNestedAccounts] = useState<any[]>([]);

  // Nested expenses state (for nested user's own panel)
  const [nestedExpenses, setNestedExpenses] = useState<NestedExpense[]>([]);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [savingExpense, setSavingExpense] = useState(false);

  // States for editing expenses
  const [editingExpense, setEditingExpense] = useState<NestedExpense | null>(null);
  const [showEditExpense, setShowEditExpense] = useState(false);
  const [editExpenseAmount, setEditExpenseAmount] = useState("");
  const [editExpenseNote, setEditExpenseNote] = useState("");
  const [savingEditExpense, setSavingEditExpense] = useState(false);

  useEffect(() => {
    if (user?.uid && isOwner) {
      const qAccounts = query(
        collection(db, "nestedAccounts"),
        where("ownerUid", "==", user.uid)
      );
      const unsubAccounts = onSnapshot(qAccounts, (snap) => {
        setNestedAccounts(snap.docs.map(doc => doc.data()));
      });

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayStartMs = todayStart.getTime();

      const qTxns = query(
        collection(db, "nestedTransactions"),
        where("ownerUid", "==", user.uid),
        where("date", ">=", todayStartMs)
      );
      const unsubTxns = onSnapshot(qTxns, (snap) => {
        setNestedActivity(snap.docs.map(doc => doc.data()));
      });

      return () => {
        unsubAccounts();
        unsubTxns();
      };
    }
  }, [user?.uid, isOwner]);

  const groupedActivity = useMemo(() => {
    const map: Record<string, { label: string; email: string; payments: any[] }> = {};
    nestedActivity.forEach((act) => {
      const acc = nestedAccounts.find(a => a.nestedUid === act.nestedUid);
      const name = acc?.label || act.nestedEmail || acc?.nestedEmail || "Nested Account";
      if (!map[act.nestedUid]) {
        map[act.nestedUid] = { label: name, email: acc?.nestedEmail || "", payments: [] };
      }
      map[act.nestedUid].payments.push(act);
    });
    return Object.values(map);
  }, [nestedActivity, nestedAccounts]);

  useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [intro]);

  useEffect(() => {
    if (user?.uid && isOwner) {
      runRetroactiveCleanup(user.uid);
    }
  }, [user?.uid, isOwner]);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(searchQuery.trim().toLowerCase()), 220);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const loadDashboard = useCallback(async () => {
    if (!user || !effectiveOwnerId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      setLoading(true);
      setAnalytics(await getDashboardAnalytics(effectiveOwnerId, isOwner ? undefined : user.uid));
    } catch (error) {
      console.error("Dashboard load failed", error);
      Alert.alert("Dashboard unavailable", "Could not load finance analytics. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, effectiveOwnerId, isOwner]);

  // For nested users: refresh dashboard every time they navigate back to this screen
  // (e.g. after recording a payment or registering a customer)
  useFocusEffect(
    useCallback(() => {
      if (!isOwner) {
        loadDashboard();
        // Also refresh nested expenses
        if (user?.uid && effectiveOwnerId) {
          import("firebase/firestore").then(({ getDocs: gd, query: q, collection: col, where: wh, orderBy }) => {
            gd(q(col(db, "nestedExpenses"), wh("nestedUid", "==", user.uid))).then((snap) => {
              setNestedExpenses(snap.docs.map((d) => d.data() as NestedExpense));
            }).catch(() => {});
          });
        }
      }
    }, [isOwner, loadDashboard, user?.uid, effectiveOwnerId])
  );

  useEffect(() => {
    if (!user || !effectiveOwnerId) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const unsub = subscribeDashboardAnalytics(
      effectiveOwnerId,
      (nextAnalytics) => {
        setAnalytics(nextAnalytics);
        setLoading(false);
        setRefreshing(false);
      },
      () => {
        loadDashboard();
      },
      isOwner ? undefined : user.uid
    );
    return unsub;
  }, [loadDashboard, user, effectiveOwnerId, isOwner]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDashboard();
  }, [loadDashboard]);

  const openCustomerSearch = useCallback(async () => {
    lightImpact();
    setSearchOpen(true);
    if (!user || !effectiveOwnerId || allCustomers.length > 0) return;
    try {
      setSearchLoading(true);
      let list = await getAllActiveCustomersWithVillages(effectiveOwnerId);
      if (!isOwner) {
        // Fetch nested customers registered by this nested user
        const qNestedCust = query(
          collection(db, "nestedCustomers"),
          where("nestedUserId", "==", user.uid)
        );
        const nestedCustSnap = await getDocs(qNestedCust);
        
        // Fetch villages to resolve day/shift/names for temp customers
        const villagesSnap = await getDocs(query(collection(db, "villages"), where("userId", "==", effectiveOwnerId)));
        const villageMap = new Map(villagesSnap.docs.map(doc => [doc.id, doc.data() as any]));

        const nestedCusts = nestedCustSnap.docs.map(doc => {
          const data = doc.data();
          const v = villageMap.get(data.villageId);
          return {
            id: doc.id,
            name: data.name,
            phone: data.phone,
            aadhar: data.aadhar,
            numericalId: data.numericalId || 999999,
            coName: data.coName || "",
            coId: data.coId || null,
            villageId: data.villageId,
            villageName: v?.name || "",
            villageDayOfWeek: v?.dayOfWeek || "",
            villageShift: v?.shift || "",
            isTemp: true,
          } as any;
        });
        list = [...list, ...nestedCusts];
      }
      setAllCustomers(list);
    } catch (error) {
      console.error("Search failed:", error);
      Alert.alert("Search failed", "Could not load customers. Please try again.");
    } finally {
      setSearchLoading(false);
    }
  }, [allCustomers.length, user, effectiveOwnerId, isOwner]);

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
    () => {
      const actions = [
        { key: "reports", label: t("reports"), icon: "document-text-outline", action: () => nav.push("/reports") },
        { key: "account", label: t("account"), icon: "wallet-outline", action: () => nav.push("/account") },
        { key: "analytics", label: t("analytics"), icon: "bar-chart-outline", action: () => nav.push("/graph") },
        { key: "history", label: t("history"), icon: "time-outline", action: () => nav.push("/history") },
        { key: "settings", label: t("settings"), icon: "settings-outline", action: () => nav.push("/settings") },
      ];
      if (!isOwner) {
        return actions.filter(act => act.key !== "account" && act.key !== "analytics" && act.key !== "reports");
      }
      return actions;
    },
    [nav, t, isOwner]
  );

  const startCollection = useCallback(() => {
    lightImpact();
    router.push({ pathname: "/village/[day]/[shift]", params: { day: selectedDay, shift: selectedShift } });
  }, [selectedDay, selectedShift]);

  const totals = analytics?.totals;
  const balance = (totals?.totalCollection ?? 0) - (totals?.pendingAmount ?? 0);
  const savings = (totals?.monthlyRevenue ?? 0) - (totals?.distributedThisMonth ?? 0);
  // Main account current amount: BF + collection - distribution - expenses
  const mainCurrentAmount = (totals?.balancingFund ?? 0) + (totals?.totalCollection ?? 0) - (totals?.totalDistributed ?? 0) - (totals?.totalExpenses ?? 0);
  const dueAlerts = analytics?.dueAlerts ?? [];
  // Nested account current amount: BF + collectionToday - distributedToday - expensesToday
  const nestedExpensesToday = useMemo(() => {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    return nestedExpenses.filter(e => e.date >= todayStart.getTime()).reduce((s,e) => s + e.amount, 0);
  }, [nestedExpenses]);

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

  const handleAddExpense = useCallback(async () => {
    const amount = parseFloat(expenseAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid expense amount greater than 0.");
      return;
    }
    if (!user || !effectiveOwnerId) return;
    try {
      setSavingExpense(true);
      const exp = await addNestedExpense(effectiveOwnerId, user.uid, amount, expenseNote || "Expense", Date.now());
      setNestedExpenses((prev) => [exp, ...prev]);
      setExpenseAmount("");
      setExpenseNote("");
      setShowAddExpense(false);
      loadDashboard();
    } catch (e: any) {
      await logDebug("handleAddExpense failed", {
        errorName: e?.name || null,
        errorMessage: e?.message || null,
        errorStack: e?.stack || null,
        ownerUid: effectiveOwnerId,
        nestedUid: user?.uid || null,
        amount,
        note: expenseNote
      });
      Alert.alert("Error", "Could not save expense. Please try again.");
    } finally {
      setSavingExpense(false);
    }
  }, [expenseAmount, expenseNote, user, effectiveOwnerId, loadDashboard]);

  const handleOpenEditExpense = (expense: NestedExpense) => {
    setEditingExpense(expense);
    setEditExpenseAmount(expense.amount.toString());
    setEditExpenseNote(expense.note);
    setShowEditExpense(true);
  };

  const handleSaveEditExpense = useCallback(async () => {
    const amount = parseFloat(editExpenseAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid expense amount greater than 0.");
      return;
    }
    if (!editingExpense) return;
    try {
      setSavingEditExpense(true);
      await updateNestedExpense(editingExpense.id, amount, editExpenseNote || "Expense");
      setNestedExpenses((prev) =>
        prev.map((e) => (e.id === editingExpense.id ? { ...e, amount, note: editExpenseNote || "Expense" } : e))
      );
      setEditingExpense(null);
      setEditExpenseAmount("");
      setEditExpenseNote("");
      setShowEditExpense(false);
      loadDashboard();
    } catch (e: any) {
      await logDebug("handleSaveEditExpense failed", {
        errorName: e?.name || null,
        errorMessage: e?.message || null,
        errorStack: e?.stack || null,
        expenseId: editingExpense.id,
        amount,
        note: editExpenseNote
      });
      Alert.alert("Error", "Could not update expense. Please try again.");
    } finally {
      setSavingEditExpense(false);
    }
  }, [editingExpense, editExpenseAmount, editExpenseNote, loadDashboard]);

  const handleConfirmDeleteExpense = (expense: NestedExpense) => {
    const performDelete = async () => {
      try {
        await deleteNestedExpense(expense.id);
        setNestedExpenses((prev) => prev.filter((e) => e.id !== expense.id));
        loadDashboard();
      } catch (e: any) {
        await logDebug("handleDeleteExpense failed", {
          errorName: e?.name || null,
          errorMessage: e?.message || null,
          errorStack: e?.stack || null,
          expenseId: expense.id
        });
        Alert.alert("Error", "Could not delete expense.");
      }
    };

    if (Platform.OS === "web") {
      const confirmed = window.confirm(`Are you sure you want to delete the expense of Rs.${expense.amount}?`);
      if (confirmed) {
        performDelete();
      }
    } else {
      Alert.alert(
        "Delete Expense",
        `Are you sure you want to delete the expense of Rs.${expense.amount}?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: performDelete }
        ]
      );
    }
  };

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
              <View style={[styles.headerCard, { backgroundColor: colors.blue2, borderColor: colors.blue2, borderWidth: 1 }]}>
                <View style={styles.headerTop}>
                  <View style={styles.brandRow}>
                    <View style={[styles.brandIcon, { backgroundColor: colors.blue1 }]}>
                      <Icon name="business-outline" size={19} color={colors.amberGlow} />
                    </View>
                    <View style={styles.headerCopy}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[styles.eyebrow, { color: "#9FB2C9" }]}>{t("premiumWorkspace")}</Text>
                        <Text style={{ fontSize: 9, fontWeight: "900", color: "#12294A", backgroundColor: colors.amberGlow, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, overflow: "hidden" }}>v1.0.3</Text>
                      </View>
                      <Text style={[styles.header, { color: colors.white }]}>{t("financeDashboard")}</Text>
                      <Text style={[styles.welcome, { color: "#C4D2E2" }]}>{getGreeting(t)}, {displayName} | {todayLabel}</Text>
                    </View>
                  </View>
                  <Pressable accessibilityLabel={t("searchCustomers")} style={[styles.searchButton, { backgroundColor: colors.blue1 }]} onPress={openCustomerSearch}>
                    <Icon name="search" size={20} color={colors.amberGlow} />
                  </Pressable>
                </View>

                <Pressable style={[styles.todayCard, { backgroundColor: colors.blue1, borderColor: colors.blue1 }]} onPress={() => nav.push("/graph")}>
                  <View style={[styles.todayIcon, { backgroundColor: "rgba(212,175,106,0.14)" }]}>
                    <Icon name="cash-outline" size={18} color={colors.amberGlow} />
                  </View>
                  <View style={styles.todayCopy}>
                    <Text style={[styles.todayLabel, { color: "#9FB2C9" }]}>{t("collectedToday")}</Text>
                    <Text style={[styles.todayValue, { color: colors.white }]}>{formatMoney(totals?.collectionToday ?? 0)}</Text>
                    <Text style={[styles.todayHint, { color: "#7E93AC" }]}>{t("distributedTodayHint")} {formatMoney(totals?.distributedToday ?? 0)}</Text>
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
                                  backgroundColor: "#D4AF6A", // Orange
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
                            Paid: <Text style={{fontWeight: "900", color: "#D4AF6A"}}>{formatMoney(routeProgress.collected)}</Text>
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
                        <Icon name="arrow-forward" size={18} color={Colors.white} />
                      </LinearGradient>
                    </Pressable>

                    <View style={styles.walletRouteSummary}>
                      <Text style={[styles.walletRouteText, { color: colors.textSecondary }]}>Cash: {formatMoney(totals?.cashWalletBalance ?? 0)}</Text>
                      <View style={[styles.walletRouteDot, { backgroundColor: colors.border }]} />
                      <Text style={[styles.walletRouteText, { color: colors.textSecondary }]}>PhonePe: {formatMoney(totals?.phonePeWalletBalance ?? 0)}</Text>
                    </View>
                  </DashboardPanel>

                  {isOwner && nestedActivity.length > 0 && (
                    <DashboardPanel
                      title="Nested Activity Today"
                      subtitle="Payments entered by nested accounts"
                    >
                      {groupedActivity.map((group) => {
                        const totalGroupAmount = group.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
                        return (
                          <View key={group.label} style={styles.nestedGroupContainer}>
                            <View style={[styles.nestedGroupHeader, { borderBottomColor: colors.border }]}>
                              <Text style={[styles.nestedGroupTitle, { color: colors.text }]}>{group.label}</Text>
                              <Text style={[styles.nestedGroupTotal, { color: colors.primary }]}>Total: Rs.{totalGroupAmount.toLocaleString("en-IN")}</Text>
                            </View>
                            {group.payments.map((p: any) => (
                              <View key={p.id} style={[styles.nestedActivityRow, { borderBottomColor: colors.border }]}>
                                <View style={styles.nestedActivityLeft}>
                                  <Text style={[styles.nestedActivityName, { color: colors.text }]}>{p.customerName || "Customer"}</Text>
                                  <Text style={[styles.nestedActivityTime, { color: colors.textSecondary }]}>
                                    {new Date(p.date || p.createdAt).toLocaleTimeString('en-IN', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      hour12: true,
                                    })}
                                  </Text>
                                </View>
                                <Text style={[styles.nestedActivityAmount, { color: colors.paidGreen || "#2E7D32" }]}>+Rs.{p.amount}</Text>
                              </View>
                            ))}
                          </View>
                        );
                      })}
                    </DashboardPanel>
                  )}

                  <View style={styles.metricGrid}>
                    {isOwner ? (
                      <>
                        <DashboardMetric title={t("balance")} value={formatMoney(balance)} caption={t("collectedMinusPending")} icon="wallet-outline" tone="#FFFFFF" />
                        <DashboardMetric title={t("income")} value={formatMoney(totals?.monthlyRevenue ?? 0)} caption={t("collectedThisMonth")} icon="cash-outline" tone={Colors.lightSeaGreen} />
                        <DashboardMetric title={t("expense")} value={formatMoney(totals?.distributedThisMonth ?? 0)} caption={t("distributedThisMonth")} icon="trending-up-outline" tone={Colors.amberGlow} />
                        <DashboardMetric title="Current Amount" value={formatMoney(mainCurrentAmount)} caption="BF + collection − dist. − exp." icon="calculator-outline" tone={Colors.lightSeaGreen} />
                      </>
                    ) : (
                      <>
                        <DashboardMetric title="BF (Opening)" value={formatMoney(totals?.balancingFund ?? 0)} caption="Opening balance" icon="wallet-outline" tone="#FFFFFF" />
                        <DashboardMetric title="Current Amount" value={formatMoney(totals?.netCashPosition ?? 0)} caption="BF + collected − dist. − exp." icon="calculator-outline" tone={Colors.lightSeaGreen} />
                        <DashboardMetric title="Today Collected" value={formatMoney(totals?.collectionToday ?? 0)} caption="Collected today" icon="cash-outline" tone={Colors.lightSeaGreen} />
                        <DashboardMetric title="Today Distributed" value={formatMoney(totals?.distributedToday ?? 0)} caption="Distributed today" icon="trending-up-outline" tone={Colors.amberGlow} />
                        <DashboardMetric title="Total Collected" value={formatMoney(totals?.totalCollection ?? 0)} caption="All-time collected" icon="cash-outline" tone={Colors.lightSeaGreen} />
                        <DashboardMetric title="Total Distributed" value={formatMoney(totals?.totalDistributed ?? 0)} caption="All-time distributed" icon="trending-up-outline" tone={Colors.amberGlow} />
                      </>
                    )}
                  </View>

                  {/* Nested Expenses Panel — only for nested (non-owner) users */}
                  {!isOwner && (
                    <DashboardPanel
                      title="Expenses"
                      subtitle="Track your daily expenses"
                      action={
                        <Pressable
                          style={[styles.csvButton, { backgroundColor: Colors.danger + "18", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }]}
                          onPress={() => setShowAddExpense(true)}
                        >
                          <Icon name="add-circle-outline" size={14} color={Colors.danger} />
                          <Text style={[styles.csvText, { color: Colors.danger }]}>Add</Text>
                        </Pressable>
                      }
                    >
                      {nestedExpenses.length === 0 ? (
                        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center", paddingVertical: 8 }}>
                          No expenses logged yet. Tap Add to record one.
                        </Text>
                      ) : (
                        nestedExpenses.slice(0, 10).map((exp) => (
                          <View
                            key={exp.id}
                            style={[styles.nestedActivityRow, { borderBottomColor: colors.border, alignItems: "center" }]}
                          >
                            <View style={styles.nestedActivityLeft}>
                              <Text style={[styles.nestedActivityName, { color: colors.text }]}>{exp.note || "Expense"}</Text>
                              <Text style={[styles.nestedActivityTime, { color: colors.textSecondary }]}>
                                {new Date(exp.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                                {" · "}
                                {new Date(exp.date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                              </Text>
                            </View>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                              <Text style={[styles.nestedActivityAmount, { color: Colors.danger }]}>−Rs.{exp.amount.toLocaleString("en-IN")}</Text>
                              <Pressable onPress={() => handleOpenEditExpense(exp)} style={{ padding: 4 }}>
                                <Icon name="create-outline" size={16} color={colors.primary} />
                              </Pressable>
                              <Pressable onPress={() => handleConfirmDeleteExpense(exp)} style={{ padding: 4 }}>
                                <Icon name="trash-outline" size={16} color={Colors.danger} />
                              </Pressable>
                            </View>
                          </View>
                        ))
                      )}
                    </DashboardPanel>
                  )}

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

        {/* Add Expense Modal — nested users only */}
        <Modal visible={showAddExpense} transparent animationType="slide" onRequestClose={() => setShowAddExpense(false)}>
          <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
            <View style={[styles.expenseModal, { backgroundColor: colors.card }]}>
              <View style={styles.expenseModalHeader}>
                <Text style={[styles.expenseModalTitle, { color: colors.text }]}>Add Expense</Text>
                <Pressable onPress={() => { setShowAddExpense(false); setExpenseAmount(""); setExpenseNote(""); }}>
                  <Icon name="close" size={22} color={colors.textSecondary} />
                </Pressable>
              </View>
              <Text style={[styles.expenseModalLabel, { color: colors.textSecondary }]}>Amount *</Text>
              <TextInput
                placeholder="Enter expense amount"
                placeholderTextColor={colors.textMuted}
                value={expenseAmount}
                onChangeText={setExpenseAmount}
                keyboardType="numeric"
                autoFocus
                style={[styles.expenseInput, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
              />
              <Text style={[styles.expenseModalLabel, { color: colors.textSecondary }]}>Note (optional)</Text>
              <TextInput
                placeholder="e.g. Petrol, Tea, Lunch..."
                placeholderTextColor={colors.textMuted}
                value={expenseNote}
                onChangeText={setExpenseNote}
                style={[styles.expenseInput, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
              />
              <Pressable
                style={[styles.expenseSaveBtn, savingExpense && { opacity: 0.6 }]}
                onPress={handleAddExpense}
                disabled={savingExpense}
              >
                <Text style={styles.expenseSaveBtnText}>{savingExpense ? "Saving..." : "Save Expense"}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Edit Expense Modal — nested users only */}
        <Modal visible={showEditExpense} transparent animationType="slide" onRequestClose={() => { setShowEditExpense(false); setEditingExpense(null); }}>
          <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
            <View style={[styles.expenseModal, { backgroundColor: colors.card }]}>
              <View style={styles.expenseModalHeader}>
                <Text style={[styles.expenseModalTitle, { color: colors.text }]}>Edit Expense</Text>
                <Pressable onPress={() => { setShowEditExpense(false); setEditingExpense(null); setEditExpenseAmount(""); setEditExpenseNote(""); }}>
                  <Icon name="close" size={22} color={colors.textSecondary} />
                </Pressable>
              </View>
              <Text style={[styles.expenseModalLabel, { color: colors.textSecondary }]}>Amount *</Text>
              <TextInput
                placeholder="Enter expense amount"
                placeholderTextColor={colors.textMuted}
                value={editExpenseAmount}
                onChangeText={setEditExpenseAmount}
                keyboardType="numeric"
                autoFocus
                style={[styles.expenseInput, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
              />
              <Text style={[styles.expenseModalLabel, { color: colors.textSecondary }]}>Note (optional)</Text>
              <TextInput
                placeholder="e.g. Petrol, Tea, Lunch..."
                placeholderTextColor={colors.textMuted}
                value={editExpenseNote}
                onChangeText={setEditExpenseNote}
                style={[styles.expenseInput, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
              />
              <Pressable
                style={[styles.expenseSaveBtn, savingEditExpense && { opacity: 0.6 }]}
                onPress={handleSaveEditExpense}
                disabled={savingEditExpense}
              >
                <Text style={styles.expenseSaveBtnText}>{savingEditExpense ? "Saving..." : "Save Changes"}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

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
                            <Text style={[styles.searchCustomerPhone, { color: colors.textMuted }]}>{item.phone || "—"}</Text>
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

        {isOwner && (
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
        )}
      </LinearGradient>
    </AnimatedScreen>
  );
}

const screenWidth = Dimensions.get("window").width;

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  container: { paddingHorizontal: 14, paddingVertical: 14, paddingBottom: 36 },
  content: { width: "100%", maxWidth: Math.min(screenWidth - 36, 920), alignSelf: "center", gap: 12 },
  headerCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    shadowOpacity: 0,
    elevation: 0,
  },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  brandRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  brandIcon: { width: 36, height: 36, borderRadius: 9, backgroundColor: Colors.frozenWater, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  eyebrow: { color: Colors.textMuted, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  header: { color: Colors.nearBlack, fontSize: 22, lineHeight: 27, fontWeight: "900" },
  welcome: { color: "#426c67", fontSize: 12, marginTop: 2, fontWeight: "800" },
  searchButton: { width: 36, height: 36, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: Colors.lightSeaGreen },
  todayCard: { minHeight: 74, borderRadius: 10, backgroundColor: "#f6fffe", flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: Colors.borderLight },
  todayIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.honeyBronze, alignItems: "center", justifyContent: "center" },
  todayCopy: { flex: 1 },
  todayLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  todayValue: { color: Colors.nearBlack, fontSize: 27, lineHeight: 31, fontWeight: "900" },
  todayHint: { color: "#426c67", fontSize: 11, fontWeight: "800" },
  panel: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 16,
    gap: 12,
    shadowOpacity: 0,
    elevation: 0,
  },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  sectionCopy: { flex: 1 },
  sectionTitle: { color: Colors.nearBlack, fontSize: 15, lineHeight: 20, fontWeight: "900" },
  sectionSub: { color: Colors.textMuted, fontSize: 11, fontWeight: "800", marginTop: 1 },
  routeMeta: { color: Colors.textMuted, fontSize: 11, fontWeight: "900" },
  controlLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  dayGrid: { flexDirection: "row", gap: 6 },
  dayChip: { flex: 1, borderWidth: 1, borderColor: Colors.borderLight, borderRadius: 8, paddingVertical: 8, alignItems: "center", backgroundColor: "#F4F6F9", minWidth: 38 },
  dayChipOn: { backgroundColor: Colors.amberGlow, borderColor: Colors.amberGlow },
  dayChipText: { color: Colors.nearBlack, fontSize: 12, fontWeight: "900" },
  dayChipTextOn: { color: Colors.white },
  shiftRow: { flexDirection: "row", gap: 8 },
  shift: { flex: 1, minHeight: 42, borderRadius: 8, borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: "#F4F6F9", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, paddingHorizontal: 8 },
  shiftOn: { backgroundColor: Colors.amberGlow, borderColor: Colors.amberGlow },
  shiftText: { color: Colors.lightSeaGreen, fontWeight: "900", fontSize: 13 },
  shiftTextOn: { color: Colors.white },
  primaryAction: { borderRadius: 9, paddingVertical: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryActionText: { color: Colors.white, fontWeight: "900", fontSize: 15 },
  walletRouteSummary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 2 },
  walletRouteText: { color: Colors.textMuted, fontSize: 11, fontWeight: "800" },
  walletRouteDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.borderLight },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: { flexGrow: 1, flexBasis: "47%", minWidth: 150, minHeight: 124, borderRadius: 12, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight, padding: 14 },
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
  nestedGroupContainer: { marginBottom: 16, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0" },
  nestedGroupHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8, borderBottomWidth: 1, paddingBottom: 6 },
  nestedGroupTitle: { fontSize: 14, fontWeight: "700" },
  nestedGroupTotal: { fontSize: 14, fontWeight: "800" },
  nestedActivityRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1 },
  nestedActivityLeft: { flex: 1 },
  nestedActivityName: { fontSize: 13, fontWeight: "600" },
  nestedActivityTime: { fontSize: 11, marginTop: 2 },
  nestedActivityAmount: { fontSize: 13, fontWeight: "700" },
  // Expense modal styles
  expenseModal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 10 },
  expenseModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  expenseModalTitle: { fontSize: 20, fontWeight: "800" },
  expenseModalLabel: { fontSize: 13, fontWeight: "600", marginTop: 4 },
  expenseInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  expenseSaveBtn: { backgroundColor: Colors.danger, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  expenseSaveBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
});
