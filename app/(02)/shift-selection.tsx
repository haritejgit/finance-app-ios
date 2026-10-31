import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db } from "../../src/firebase";
import { collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import {
  Alert,
  Animated,
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
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth-context";
import { AnimatedListItem } from "../../src/components/AnimatedListItem";
import { AnimatedScreen } from "../../src/components/AnimatedScreen";
import { CustomerIdBadge } from "../../src/components/CustomerIdBadge";
import { CashFlowRadar } from "../../src/components/CashFlowRadar";

import { getDashboardAnalytics, subscribeDashboardAnalytics, type CustomerState, type DashboardAnalytics } from "../../src/finance-analytics";
import Icon from "../../src/Icon";
import { lightImpact } from "../../src/interactions";
import { CustomerSearchResult, getAllActiveCustomersWithVillages, runRetroactiveCleanup, addNestedExpense, updateNestedExpense, deleteNestedExpense, type NestedExpense } from "../../src/repository";
import { Colors, getGradient } from "../../src/theme";
import { useTheme } from "../../src/theme-context";
import { useLanguage } from "../../src/language-context";
import { translateTelugu } from "../../src/exports";
import { groupNestedActivity } from "../../src/nested-activity";
import { withMissingIndexFallback } from "../../src/firestore-query-fallback";

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
type BottomAction = {
  key: string;
  label: string;
  icon: string;
  action: () => void;
};

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
  onLayout,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  onLayout?: (event: any) => void;
}) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  return (
    <View onLayout={onLayout} style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }, width < 500 && styles.panelCompact, width >= 1024 && styles.panelWide]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionCopy}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.sectionSub, { color: colors.textMuted }]}>{subtitle}</Text> : null}
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
  valueTone,
  sparkline,
}: {
  title: string;
  value: string;
  icon: string;
  tone: string;
  caption: string;
  valueTone?: string;
  sparkline?: number[];
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.metricCardHead}>
        <View style={[styles.metricIcon, { backgroundColor: `${tone}18` }]}>
          <Icon name={icon} size={17} color={tone} />
        </View>
        {sparkline?.length ? (
          <View style={styles.metricSparkline} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {sparkline.slice(-5).map((point, index, values) => {
              const peak = Math.max(...values, 1);
              return <View key={index} style={[styles.metricSparkBar, { height: 6 + (point / peak) * 18, backgroundColor: tone, opacity: 0.28 + index * 0.14 }]} />;
            })}
          </View>
        ) : null}
      </View>
      <Text style={[styles.metricTitle, { color: colors.textMuted }]}>{title}</Text>
      <Text style={[styles.metricValue, valueTone ? { color: valueTone } : null]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
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
            <View style={[styles.chartBar, { backgroundColor: colors.primary, height: Math.max(8, (week.collection / maxValue) * 116) }]} />
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

function BottomNavButton({ label, icon, active, onPress }: { label: string; icon: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.bottomNavButton, pressed && styles.pressed]}>
      <Icon name={icon} size={18} color={active ? Colors.honeyBronze : "#B5C6CE"} />
      <Text style={[styles.bottomNavText, { color: "#B5C6CE" }, active && styles.bottomNavTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{label}</Text>
    </Pressable>
  );
}

export default function ShiftSelectionScreen() {
  const nav = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const { user, userProfile } = useAuth();
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
  const bottomNavSlide = useRef(new Animated.Value(0)).current;
  const dashboardScrollRef = useRef<ScrollView | null>(null);
  const budgetAlertsOffset = useRef(0);
  const [bottomNavWidth, setBottomNavWidth] = useState(0);
  const [activeBottomKey, setActiveBottomKey] = useState("dashboard");

  const logDebug = useCallback(async (message: string, extra: any = {}) => {
    try {
      const { addDoc, collection } = await import("firebase/firestore");
      await addDoc(collection(db, "debugLogs"), {
        timestamp: Date.now(),
        userUid: user?.uid || null,
        message: message.slice(0, 120)
      });
    } catch (e) {
      console.error("Failed to write debug log", e);
    }
  }, [user?.uid]);

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
    return groupNestedActivity(nestedActivity, nestedAccounts);
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

  // Dashboard analytics already refresh from Firestore snapshots; only reload
  // nested expenses here because they are also shown in the local panel.
  useFocusEffect(
    useCallback(() => {
      if (!isOwner) {
        if (user?.uid && effectiveOwnerId) {
          import("firebase/firestore").then(async ({ getDocs: gd, query: q, collection: col, where: wh, orderBy, limit }) => {
            const expenses = col(db, "nestedExpenses");
            const ownerFilter = wh("nestedUid", "==", user.uid);
            const snap = await withMissingIndexFallback(
              () => gd(q(expenses, ownerFilter, orderBy("date", "desc"), limit(10))),
              // Keep the panel functional while a newly deployed composite index is building.
              () => gd(q(expenses, ownerFilter))
            );
            setNestedExpenses(snap.docs.slice(0, 10).map((d) => d.data() as NestedExpense));
          }).catch(() => {
            // Keep existing dashboard error handling: expense history is auxiliary to the main finance summary.
          });
        }
      }
    }, [isOwner, user?.uid, effectiveOwnerId])
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

  const searchIndex = useMemo(
    () =>
      allCustomers.map((customer) => ({
        customer,
        searchableText: [
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
          .toLowerCase(),
        phoneDigits: (customer.phone || "").replace(/\D/g, ""),
      })),
    [allCustomers]
  );

  const searchResults = useMemo(() => {
    const numericQuery = debouncedQuery.replace(/\D/g, "");
    return searchIndex
      .filter(({ customer, searchableText, phoneDigits }) => {
        const state = analytics?.customerStates[customer.id] ?? "pending";
        if (customerFilter !== "all" && state !== customerFilter) return false;
        if (!debouncedQuery) return true;
        const textMatch = searchableText.includes(debouncedQuery);
        const phoneMatch = numericQuery.length > 0 && phoneDigits.includes(numericQuery);
        return textMatch || phoneMatch;
      })
      .map(({ customer }) => customer)
      .slice(0, 80);
  }, [searchIndex, analytics?.customerStates, customerFilter, debouncedQuery]);

  const displayName = useMemo(() => (user?.displayName || user?.email || "User").split(/[ @]/)[0], [user?.displayName, user?.email]);
  const todayLabel = useMemo(() => new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" }), []);
  const bottomActions = useMemo(
    () => {
      const actions: BottomAction[] = [
        { key: "dashboard", label: t("financeDashboard"), icon: "home-outline", action: () => dashboardScrollRef.current?.scrollTo({ y: 0, animated: true }) },
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
  const visibleActiveBottomKey = bottomActions.some((item) => item.key === activeBottomKey)
    ? activeBottomKey
    : bottomActions[0]?.key;
  const activeBottomIndex = Math.max(0, bottomActions.findIndex((item) => item.key === visibleActiveBottomKey));
  const bottomNavTrackWidth = Math.max(0, bottomNavWidth - 12);
  const bottomNavItemWidth = bottomActions.length > 0 ? bottomNavTrackWidth / bottomActions.length : 0;

  useEffect(() => {
    if (!bottomNavItemWidth) return;
    Animated.spring(bottomNavSlide, {
      toValue: activeBottomIndex * bottomNavItemWidth,
      useNativeDriver: true,
      damping: 18,
      stiffness: 180,
      mass: 0.7,
    }).start();
  }, [activeBottomIndex, bottomNavItemWidth, bottomNavSlide]);

  const startCollection = useCallback(() => {
    lightImpact();
    router.push({ pathname: "/village/[day]/[shift]", params: { day: selectedDay, shift: selectedShift } });
  }, [selectedDay, selectedShift]);

  const totals = analytics?.totals;
  const balance = (totals?.totalCollection ?? 0) - (totals?.pendingAmount ?? 0);
  // Main account current amount follows the Analytics Center all-time ledger.
  const mainCurrentAmount = totals?.netCashPosition ?? 0;
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
  const yesterdayCollection = analytics?.dailyCashFlow?.[Math.max(0, (analytics?.dailyCashFlow?.length ?? 0) - 2)]?.inflow ?? 0;
  const collectionChange = (totals?.collectionToday ?? 0) - yesterdayCollection;
  const routeTargetPercent = routeProgress.target > 0 ? Math.round((routeProgress.collected / routeProgress.target) * 100) : 0;

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
  }, [expenseAmount, expenseNote, user, effectiveOwnerId, loadDashboard, logDebug]);

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
  }, [editingExpense, editExpenseAmount, editExpenseNote, loadDashboard, logDebug]);

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
      <LinearGradient colors={[...getGradient(colors)]} style={styles.root}>
        <SafeAreaView style={styles.safe}>
          <ScrollView
            ref={dashboardScrollRef}
            contentContainerStyle={[styles.container, { paddingHorizontal: viewportWidth >= 900 ? 28 : 16, paddingTop: viewportWidth < 500 ? 14 : 24, paddingBottom: 126 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          >
            <Animated.View
              style={[
                styles.content,
                {
                  maxWidth: Math.min(viewportWidth - (viewportWidth >= 900 ? 56 : 32), 1180),
                  gap: viewportWidth >= 900 ? 18 : 14,
                  flexDirection: viewportWidth >= 1024 ? "row" : "column",
                  flexWrap: viewportWidth >= 1024 ? "wrap" : "nowrap",
                  alignItems: "stretch",
                },
                {
                  opacity: intro,
                  transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }],
                },
              ]}
            >
              <View style={[styles.headerCard, viewportWidth < 500 && styles.headerCompact, { width: "100%", backgroundColor: colors.blue2, borderColor: colors.blue2, borderWidth: 1 }]}>
                <View style={styles.headerTop}>
                  <View style={styles.brandRow}>
                    <View style={[styles.brandIcon, styles.brandIconGold]}>
                      <Icon name="cash-outline" size={22} color={colors.honeyBronze} />
                    </View>
                    <View style={styles.headerCopy}>
                      <Text style={[styles.brandTitle, { color: colors.white }]} numberOfLines={1}>Karthikeya <Text style={{ color: colors.honeyBronze }}>Finance</Text></Text>
                      <View style={styles.brandMeta}>
                        <Text style={[styles.eyebrow, { color: "#B8CAD2" }]}>{t("premiumWorkspace")}</Text>
                        <Text style={[styles.versionBadge, { color: colors.honeyBronze }]}>v1.0.0</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.headerActions}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${t("budgetAlerts")}: ${dueAlerts.length}`} style={styles.notificationButton} onPress={() => dashboardScrollRef.current?.scrollTo({ y: budgetAlertsOffset.current, animated: true })}>
                      <Icon name="notifications-outline" size={21} color={colors.white} />
                      {dueAlerts.length > 0 && <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{dueAlerts.length > 9 ? "9+" : dueAlerts.length}</Text></View>}
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={t("account")} style={styles.avatarButton} onPress={() => nav.push("/account")}>
                      <Text style={styles.avatarText}>{displayName.slice(0, 1).toUpperCase()}</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.greetingRow}>
                  <View style={styles.greetingCopy}>
                    <Text style={[styles.welcome, { color: colors.white }]}>{getGreeting(t)}, {displayName} 👋</Text>
                    <Text style={styles.dateLabel}>{todayLabel}</Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={t("searchCustomers")} style={[styles.searchButton, { backgroundColor: colors.honeyBronze }]} onPress={openCustomerSearch}>
                    <Icon name="search" size={20} color={Colors.nearBlack} />
                  </Pressable>
                </View>

                <Pressable style={[styles.todayCard, viewportWidth < 500 && styles.todayCompact, { backgroundColor: colors.lightSeaGreen, borderColor: "rgba(255,255,255,0.16)" }]} onPress={() => nav.push("/graph")}>
                  <View style={[styles.todayIcon, { backgroundColor: "rgba(255,255,255,0.14)" }]}>
                    <Icon name="cash-outline" size={20} color={colors.white} />
                  </View>
                  <View style={styles.todayCopy}>
                    <Text style={[styles.todayLabel, { color: "rgba(255,255,255,0.76)" }]}>{t("collectedToday")}</Text>
                    <Text style={[styles.todayValue, viewportWidth < 500 && styles.todayValueCompact, { color: colors.white }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{formatMoney(totals?.collectionToday ?? 0)}</Text>
                    <View style={styles.todayChangeRow}>
                      <Icon name={collectionChange >= 0 ? "arrow-up" : "arrow-down"} size={13} color={collectionChange >= 0 ? "#54E18A" : "#FF8A83"} />
                      <Text style={[styles.todayChange, { color: collectionChange >= 0 ? "#54E18A" : "#FF8A83" }]}>{collectionChange >= 0 ? "+" : "−"}{formatMoney(Math.abs(collectionChange))}</Text>
                      <Text style={styles.todayCompare}>vs yesterday</Text>
                    </View>
                    <Text style={[styles.todayHint, { color: "rgba(255,255,255,0.78)" }]}>{t("distributedTodayHint")} {formatMoney(totals?.distributedToday ?? 0)}</Text>
                  </View>
                  <View style={styles.todayTarget}>
                    <View style={styles.targetLabelRow}><Text style={styles.targetLabel}>ROUTE TARGET</Text><Icon name="navigate-circle-outline" size={17} color={colors.white} /></View>
                    <Text style={styles.targetAmount}>{routeProgress.target > 0 ? formatMoney(routeProgress.target) : "—"}</Text>
                    <View style={styles.targetRing}><Text style={styles.targetRingValue}>{routeProgress.target > 0 ? `${routeTargetPercent}%` : "—"}</Text></View>
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
                    <Text style={[styles.controlLabel, { color: colors.textMuted }]}>{t("day")}</Text>
                    <View style={[styles.dayGrid, viewportWidth < 500 && styles.dayGridCompact]}>
                      {days.map((day, index) => (
                        <Pressable
                           key={day}
                           accessibilityLabel={`Select ${day}`}
                           onPress={() => {
                             lightImpact();
                             setSelectedDay(day);
                           }}
                           style={[styles.dayChip, { backgroundColor: colors.surfaceTint, borderColor: colors.border }, viewportWidth < 500 && styles.dayChipCompact, selectedDay === day && styles.dayChipOn]}
                        >
                          <Text style={[styles.dayChipText, { color: colors.textSecondary }, selectedDay === day && styles.dayChipTextOn]}>{shortDays[index]}</Text>
                        </Pressable>
                      ))}
                    </View>

                    <Text style={[styles.controlLabel, { color: colors.textMuted }]}>{t("shift")}</Text>
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
                        <Icon name={shift === "Morning" ? "sunny-outline" : "moon-outline"} size={17} color={active ? colors.white : colors.textSecondary} />
                            <Text style={[styles.shiftText, active && styles.shiftTextOn]}>{shift}</Text>
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
                        <View style={[styles.progressBarBg, { backgroundColor: colors.borderLight }]}>
                          {paidPercent > 0 && (
                            <View
                              style={[
                                styles.progressBarFill,
                                {
                                  width: `${paidPercent}%`,
                                  backgroundColor: Colors.amberGlow,
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
                          <View style={styles.progressStatRow}>
                            <View style={styles.progressStat}>
                              <View style={[styles.progressStatDot, { backgroundColor: Colors.success }]} />
                              <View><Text style={[styles.progressStatValue, { color: Colors.success }]}>{formatMoney(routeProgress.collected)}</Text><Text style={styles.progressStatLabel}>Paid</Text></View>
                            </View>
                            <View style={styles.progressStatDivider} />
                            <View style={styles.progressStat}>
                              <View style={[styles.progressStatDot, { backgroundColor: Colors.danger }]} />
                              <View><Text style={[styles.progressStatValue, { color: Colors.danger }]}>{formatMoney(routeProgress.dueAmount)}</Text><Text style={styles.progressStatLabel}>Dues / {formatMoney(routeProgress.target)}</Text></View>
                            </View>
                            <View style={styles.progressStatDivider} />
                            <View style={styles.progressStat}>
                              <Icon name="people-outline" size={16} color={Colors.nearBlack} />
                              <View><Text style={[styles.progressStatValue, { color: Colors.nearBlack }]}>{remainingCustomers}</Text><Text style={styles.progressStatLabel}>Customers left</Text></View>
                            </View>
                          </View>
                          {remainingCustomers > 0 ? (
                            <Text style={[styles.progressHintText, styles.progressHintCompact, { color: colors.textMuted }]}>
                              Rs. {Math.round(remainingTarget).toLocaleString("en-IN")} left • {remainingCustomers} customer{remainingCustomers === 1 ? "" : "s"} remaining
                            </Text>
                          ) : (
                            <Text style={[styles.progressHintText, {color: Colors.success, fontWeight: "800"}]}>
                              🎉 Route Visited! {routeProgress.paidCustomerCount} Paid • {routeProgress.dueCustomerCount} Dues
                            </Text>
                          )}
                        </View>
                      </View>
                    )}

                    <Pressable accessibilityLabel={t("startCollection")} onPress={startCollection}>
                      <View style={styles.primaryAction}>
                        <Text style={styles.primaryActionText}>{t("startCollection")}</Text>
                        <Icon name="arrow-forward" size={18} color={Colors.white} />
                      </View>
                    </Pressable>

                    <View style={styles.walletRouteSummary}>
                      <View style={styles.walletBadge}><Icon name="cash-outline" size={14} color={colors.primary} /><Text style={[styles.walletRouteText, { color: colors.textSecondary }]}>Cash: {formatMoney(totals?.cashWalletBalance ?? 0)}</Text></View>
                      <View style={[styles.walletRouteDot, { backgroundColor: colors.border }]} />
                      <View style={styles.walletBadge}><Icon name="phone-portrait-outline" size={14} color={colors.primary} /><Text style={[styles.walletRouteText, { color: colors.textSecondary }]}>PhonePe: {formatMoney(totals?.phonePeWalletBalance ?? 0)}</Text></View>
                      <View style={[styles.walletRouteDot, { backgroundColor: colors.border }]} />
                      <View style={styles.walletBadge}><Icon name="wallet-outline" size={14} color={colors.primary} /><Text style={[styles.walletRouteText, { color: colors.textSecondary }]}>Total: {formatMoney(totals?.totalWalletFunds ?? 0)}</Text></View>
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

                  <View style={[styles.metricGrid, viewportWidth >= 1024 && styles.panelWide]}>
                    {isOwner ? (
                      <>
                        <DashboardMetric title={t("balance")} value={formatMoney(balance)} caption={t("collectedMinusPending")} icon="cash-outline" tone="#B03A3A" valueTone="#B03A3A" sparkline={analytics?.weeklyTrend.map((item) => item.collection)} />
                        <DashboardMetric title={t("income")} value={formatMoney(totals?.monthlyRevenue ?? 0)} caption={t("collectedThisMonth")} icon="trending-up-outline" tone={Colors.success} valueTone={Colors.success} sparkline={analytics?.weeklyTrend.map((item) => item.collection)} />
                        <DashboardMetric title={t("expense")} value={formatMoney(totals?.distributedThisMonth ?? 0)} caption={t("distributedThisMonth")} icon="arrow-down-outline" tone="#9A6B1E" valueTone="#9A6B1E" sparkline={analytics?.weeklyTrend.map((item) => item.distribution)} />
                        <DashboardMetric title="Current Amount" value={formatMoney(mainCurrentAmount)} caption="BF + invested + collection - dist. - exp." icon="alert-triangle-outline" tone="#B03A3A" valueTone="#B03A3A" sparkline={analytics?.weeklyTrend.map((item) => item.collection)} />
                        <DashboardMetric title="Total Customers" value={String(totals?.customerCount ?? 0)} caption="Active customer accounts" icon="people-outline" tone="#3478C4" valueTone="#245D99" sparkline={analytics?.weeklyTrend.map((item) => item.collection)} />
                      </>
                    ) : (
                      <>
                        <DashboardMetric title="BF (Opening)" value={formatMoney(totals?.balancingFund ?? 0)} caption="Opening balance" icon="wallet-outline" tone={Colors.nearBlack} valueTone={Colors.nearBlack} />
                        <DashboardMetric title="Current Amount" value={formatMoney(totals?.netCashPosition ?? 0)} caption="BF + collected - dist. - exp." icon="calculator-outline" tone="#B03A3A" valueTone="#B03A3A" />
                        <DashboardMetric title="Today Collected" value={formatMoney(totals?.collectionToday ?? 0)} caption="Collected today" icon="cash-outline" tone={Colors.success} valueTone={Colors.success} />
                        <DashboardMetric title="Today Distributed" value={formatMoney(totals?.distributedToday ?? 0)} caption="Distributed today" icon="trending-up-outline" tone="#9A6B1E" valueTone="#9A6B1E" />
                        <DashboardMetric title="Total Collected" value={formatMoney(totals?.totalCollection ?? 0)} caption="All-time collected" icon="cash-outline" tone={Colors.success} valueTone={Colors.success} />
                        <DashboardMetric title="Total Distributed" value={formatMoney(totals?.totalDistributed ?? 0)} caption="All-time distributed" icon="trending-up-outline" tone="#9A6B1E" valueTone="#9A6B1E" />
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
                      {/* ── Cash Flow Forecast (Top of Monthly Overview) ── */}
                      {analytics && isOwner && (() => {
                        const tomorrowAmt = analytics.expectedCollectionTomorrow ?? 0;
                        const conf = Math.round(analytics.customerHealth?.onTimePaymentRate ?? 92);
                        const confColor = conf >= 75 ? "#4ADE80" : conf >= 50 ? "#FACC15" : "#F87171";
                        const confBg   = conf >= 75 ? "rgba(74,222,128,0.16)" : conf >= 50 ? "rgba(250,204,21,0.16)" : "rgba(248,113,113,0.16)";
                        return (
                          <View style={[styles.forecastCard, viewportWidth >= 1024 && styles.panelWide]}>
                            <View style={styles.forecastLeft}>
                              <View style={styles.forecastIconWrap}>
                                <Icon name="sparkles-outline" size={15} color={Colors.amberGlow} />
                              </View>
                              <View>
                                <Text style={styles.forecastLabel}>{"Tomorrow's Forecast"}</Text>
                                <Text style={styles.forecastAmount}>
                                  Rs.{tomorrowAmt.toLocaleString("en-IN")}
                                </Text>
                                <Text style={styles.forecastSub}>Expected collection</Text>
                              </View>
                            </View>
                            <View style={[styles.forecastConfBadge, { backgroundColor: confBg }]}>
                              <Text style={[styles.forecastConfPct, { color: confColor }]}>{conf}%</Text>
                              <Text style={[styles.forecastConfLabel, { color: confColor }]}>Confidence</Text>
                            </View>
                          </View>
                        );
                      })()}

                      {analytics && isOwner && user?.uid ? <CashFlowRadar analytics={analytics} userId={user.uid} /> : null}

                      <DashboardPanel
                        title={t("monthlyOverview")}
                        subtitle={t("collectedVsDistributedByWeek")}
                        action={
                          <View style={styles.legend}>
                            <View style={[styles.legendDot, { backgroundColor: Colors.nearBlack }]} />
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
                            <Icon name="sparkles-outline" size={14} color={Colors.amberGlow} />
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
                                <Icon name="cash-outline" size={14} color={Colors.success} />
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
                    onLayout={(event) => { budgetAlertsOffset.current = event.nativeEvent.layout.y + (viewportWidth < 500 ? 14 : 24); }}
                  >
                    {dueAlerts.length ? (
                      dueAlerts.slice(0, 4).map((alert) => (
                        <Pressable
                          key={alert.customerId}
                          style={styles.alertRow}
                          onPress={() => router.push(`/profile/${alert.customerId}`)}
                        >
                          <View style={styles.alertIcon}>
                            <Icon name="alert-circle-outline" size={14} color="#B03A3A" />
                          </View>
                          <View style={styles.rowCopy}>
                            <Text style={styles.rowTitle}>{alert.customerName}</Text>
                            <Text style={styles.rowMeta}>
                              {alert.villageName} / {alert.dueCount} due / {formatMoney(alert.dueAmount)}
                            </Text>
                          </View>
                          <Icon name="warning" size={14} color={Colors.amberGlow} />
                        </Pressable>
                      ))
                    ) : (
                      <EmptyLine text={analytics ? "No active budget alerts right now." : "Sign in to load customer follow-up alerts."} />
                    )}
                  </DashboardPanel>

                </>
              )}
            </Animated.View>
          </ScrollView>
          <View
            style={[styles.bottomNav, { backgroundColor: colors.blue2, borderColor: "rgba(255,255,255,0.15)" }]}
            onLayout={(event) => setBottomNavWidth(event.nativeEvent.layout.width)}
          >
            {bottomNavItemWidth > 0 ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.bottomNavIndicator,
                  { backgroundColor: "rgba(233,199,126,0.14)" },
                  { width: bottomNavItemWidth, transform: [{ translateX: bottomNavSlide }] },
                ]}
              />
            ) : null}
            {bottomActions.map((item) => (
              <BottomNavButton
                key={item.key}
                label={item.label}
                icon={item.icon}
                active={visibleActiveBottomKey === item.key}
                onPress={() => {
                  lightImpact();
                  setActiveBottomKey(item.key);
                  item.action();
                }}
              />
            ))}
          </View>
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
            <Icon name="sparkles-outline" size={24} color={Colors.nearBlack} />
          </Pressable>
        )}
      </LinearGradient>
    </AnimatedScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  container: { paddingVertical: 24, paddingBottom: 44 },
  content: { width: "100%", maxWidth: 1180, alignSelf: "center", gap: 18 },
  headerCard: { backgroundColor: Colors.nearBlack, borderRadius: 25, padding: 18, gap: 16, shadowColor: "#102D39", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.16, shadowRadius: 22, elevation: 7 },
  headerCompact: { borderRadius: 22, padding: 15, gap: 15 },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  brandRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 11 },
  brandIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: Colors.frozenWater, alignItems: "center", justifyContent: "center" },
  brandIconGold: { width: 43, height: 43, borderRadius: 22, borderWidth: 2, borderColor: Colors.honeyBronze, backgroundColor: "rgba(233,199,126,0.12)" },
  headerCopy: { flex: 1 },
  brandTitle: { fontSize: 16, lineHeight: 20, fontWeight: "900", letterSpacing: -0.35 },
  brandMeta: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 3 },
  eyebrow: { color: Colors.textMuted, fontSize: 9, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.55 },
  versionBadge: { overflow: "hidden", borderRadius: 999, backgroundColor: "rgba(233,199,126,0.14)", paddingHorizontal: 6, paddingVertical: 2, fontSize: 8, fontWeight: "800" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  notificationButton: { position: "relative", width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  notificationBadge: { position: "absolute", top: 4, right: 4, minWidth: 13, height: 13, paddingHorizontal: 3, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: "#E44747", borderWidth: 1, borderColor: Colors.nearBlack },
  notificationBadgeText: { color: Colors.white, fontSize: 7, lineHeight: 9, fontWeight: "900" },
  avatarButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#1B4B73", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  avatarText: { color: Colors.white, fontSize: 15, fontWeight: "800" },
  greetingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  greetingCopy: { flex: 1, minWidth: 0 },
  welcome: { color: Colors.white, fontSize: 15, marginTop: 0, fontWeight: "800" },
  dateLabel: { color: "#B5C7D0", fontSize: 12, marginTop: 3, fontWeight: "500" },
  searchButton: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: Colors.honeyBronze },
  todayCard: { minHeight: 128, borderRadius: 18, backgroundColor: "#11766E", flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
  todayCompact: { minHeight: 128, borderRadius: 17, gap: 9, paddingHorizontal: 10, paddingVertical: 10 },
  todayIcon: { width: 43, height: 43, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  todayCopy: { flex: 1, minWidth: 0 },
  todayLabel: { color: "rgba(255,255,255,0.78)", fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  todayValue: { color: Colors.white, fontSize: 29, lineHeight: 34, fontWeight: "900", marginTop: 2 },
  todayValueCompact: { fontSize: 25, lineHeight: 30 },
  todayChangeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  todayChange: { fontSize: 10, fontWeight: "900" },
  todayCompare: { color: "rgba(255,255,255,0.76)", fontSize: 10, fontWeight: "600" },
  todayHint: { color: "rgba(255,255,255,0.76)", fontSize: 9, fontWeight: "600", marginTop: 3 },
  todayTarget: { width: 94, minHeight: 104, alignItems: "center", justifyContent: "space-between", padding: 8, borderRadius: 14, backgroundColor: "rgba(9,35,53,0.3)" },
  targetLabelRow: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  targetLabel: { color: "#D5E1E3", fontSize: 8, fontWeight: "800", letterSpacing: 0.2 },
  targetAmount: { color: Colors.white, alignSelf: "flex-start", fontSize: 11, fontWeight: "800" },
  targetRing: { width: 48, height: 48, borderRadius: 24, borderWidth: 4, borderColor: "#47D880", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(71,216,128,0.08)" },
  targetRingValue: { color: Colors.white, fontSize: 11, fontWeight: "900" },
  panel: {
    backgroundColor: Colors.white,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 20,
    gap: 15,
    shadowColor: "#102D39",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.045,
    shadowRadius: 14,
    elevation: 2,
  },
  panelWide: { width: "48%", flexGrow: 1 },
  panelCompact: { borderRadius: 20, padding: 16, gap: 14 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  sectionCopy: { flex: 1 },
  sectionTitle: { color: Colors.nearBlack, fontSize: 17, lineHeight: 23, fontWeight: "800" },
  sectionSub: { color: Colors.textMuted, fontSize: 12, fontWeight: "500", marginTop: 3 },
  routeMeta: { color: "#536979", fontSize: 10, fontWeight: "800", backgroundColor: "#EDF1F6", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  controlLabel: { color: "#9AA6B2", fontSize: 10.5, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.3 },
  dayGrid: { flexDirection: "row", gap: 6 },
  dayGridCompact: { flexWrap: "nowrap", gap: 4 },
  dayChip: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: Colors.borderLight, borderRadius: 12, paddingVertical: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#F7FAF9", minWidth: 38 },
  dayChipCompact: { flexBasis: 0, minWidth: 0, minHeight: 44, paddingHorizontal: 0 },
  dayChipOn: { backgroundColor: Colors.honeyBronze, borderColor: Colors.honeyBronze },
  dayChipText: { color: "#4D666D", fontSize: 12, fontWeight: "700" },
  dayChipTextOn: { color: Colors.nearBlack, fontWeight: "900" },
  shiftRow: { flexDirection: "row", gap: 10 },
  shift: { flex: 1, minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: "#F7FAF9", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 10 },
  shiftOn: { backgroundColor: Colors.honeyBronze, borderColor: Colors.honeyBronze },
  shiftText: { color: "#4D666D", fontWeight: "700", fontSize: 13 },
  shiftTextOn: { color: Colors.nearBlack, fontWeight: "900" },
  primaryAction: { backgroundColor: Colors.nearBlack, borderRadius: 13, minHeight: 50, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 },
  primaryActionText: { color: Colors.white, fontWeight: "800", fontSize: 15 },
  walletRouteSummary: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 7, paddingTop: 2 },
  walletBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  walletRouteText: { color: Colors.textMuted, fontSize: 9, fontWeight: "800" },
  walletRouteDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.borderLight },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metricCard: { flexGrow: 1, flexBasis: "46%", minWidth: 150, minHeight: 132, borderRadius: 18, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: Colors.borderLight, padding: 18 },
  metricCardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  metricSparkline: { height: 28, flexDirection: "row", alignItems: "flex-end", gap: 3 },
  metricSparkBar: { width: 4, borderRadius: 3 },
  metricIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 0 },
  metricTitle: { color: Colors.textMuted, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 },
  metricValue: { color: Colors.nearBlack, fontSize: 21, lineHeight: 27, fontWeight: "800", marginTop: 5 },
  metricCaption: { color: Colors.textMuted, fontSize: 12, fontWeight: "500", marginTop: 3 },
  legend: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: Colors.textMuted, fontSize: 10, fontWeight: "900" },
  chart: { height: 142, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10, paddingTop: 2 },
  chartColumn: { flex: 1, alignItems: "center", gap: 6 },
  chartBarWrap: { height: 116, flexDirection: "row", alignItems: "flex-end", gap: 5 },
  chartBar: { width: 10, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  chartBarOut: { backgroundColor: Colors.amberGlow },
  chartBarIn: { backgroundColor: Colors.nearBlack },
  chartLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: "900" },
  panelIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: Colors.frozenWater, alignItems: "center", justifyContent: "center" },
  insightRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  insightDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.amberGlow, marginTop: 5 },
  insightText: { flex: 1, color: "#3E4C5E", fontSize: 13, lineHeight: 19, fontWeight: "700" },
  csvButton: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 11, paddingVertical: 8 },
  csvText: { color: Colors.nearBlack, fontSize: 11, fontWeight: "800" },
  transactionRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: "#EEF1F5" },
  transactionIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#E4F3EA", alignItems: "center", justifyContent: "center" },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: Colors.nearBlack, fontSize: 14, fontWeight: "900" },
  rowMeta: { color: Colors.textMuted, fontSize: 12, fontWeight: "800", marginTop: 2 },
  transactionAmount: { color: Colors.lightSeaGreen, fontSize: 13, fontWeight: "900" },
  alertBadge: { overflow: "hidden", borderRadius: 6, backgroundColor: "#FBEAEA", color: "#B03A3A", paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  alertRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: "#EEF1F5" },
  alertIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#FBEAEA", alignItems: "center", justifyContent: "center" },
  emptyText: { color: Colors.textMuted, fontSize: 13, fontWeight: "800", paddingVertical: 12 },
  bottomNav: { position: "absolute", left: 12, right: 12, bottom: 7, flexDirection: "row", justifyContent: "space-between", borderRadius: 18, borderWidth: 1, padding: 6, overflow: "hidden", shadowColor: "#102D39", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.16, shadowRadius: 12, elevation: 8, zIndex: 8 },
  bottomNavIndicator: { position: "absolute", top: 6, bottom: 6, left: 6, borderRadius: 13, backgroundColor: "rgba(233,199,126,0.14)" },
  bottomNavButton: { flex: 1, minHeight: 54, borderRadius: 13, borderWidth: 0, alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 3, paddingVertical: 5, zIndex: 1 },
  bottomNavText: { color: "#70838A", fontSize: 11, fontWeight: "600", textAlign: "center" },
  bottomNavTextActive: { color: Colors.honeyBronze, fontWeight: "900" },
  progressCard: { backgroundColor: "#fafbfc", borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: Colors.borderLight },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  progressTitle: { fontSize: 12, fontWeight: "900", color: Colors.nearBlack },
  progressPercentText: { fontSize: 13, fontWeight: "900", color: Colors.lightSeaGreen },
  progressBarBg: { height: 9, backgroundColor: "#e2e8f0", borderRadius: 6, overflow: "hidden", marginBottom: 10, flexDirection: "row" },
  progressBarFill: { height: "100%", borderRadius: 4 },
  progressDetails: { gap: 7 },
  progressStatRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 5 },
  progressStat: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  progressStatDot: { width: 8, height: 8, borderRadius: 4 },
  progressStatValue: { fontSize: 10, lineHeight: 13, fontWeight: "900" },
  progressStatLabel: { color: Colors.textMuted, fontSize: 9, lineHeight: 11, fontWeight: "700" },
  progressStatDivider: { width: 1, height: 28, backgroundColor: Colors.borderLight },
  progressHintText: { fontSize: 10, fontWeight: "800", color: Colors.amberGlow },
  progressHintCompact: { marginTop: 5 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
  skeletonPanel: { width: "100%", backgroundColor: Colors.white, borderRadius: 18, borderWidth: 1, borderColor: Colors.borderLight, padding: 16, gap: 14 },
  skeletonLine: { height: 16, borderRadius: 999, backgroundColor: "#DCE6F7" },
  searchModalSafe: { flex: 1 },
  searchModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 14, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#DCE6F7" },
  searchModalTitle: { color: "#111827", fontSize: 22, fontWeight: "700" },
  searchCloseBtn: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
  searchModalContent: { flex: 1, padding: 16 },
  customerSearchShell: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, borderWidth: 1, borderColor: "#DCE6F7", backgroundColor: "#FFFFFF", paddingHorizontal: 12, marginBottom: 10 },
  customerSearchInput: { flex: 1, paddingVertical: 13, fontSize: 16, color: "#111827" },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 6 },
  filterChip: { minHeight: 40, borderRadius: 999, borderWidth: 1, borderColor: "#DCE6F7", paddingHorizontal: 12, paddingVertical: 9, backgroundColor: "#FFFFFF", justifyContent: "center" },
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
  aiFab: { position: "absolute", right: 18, bottom: 88, width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", backgroundColor: Colors.amberGlow, shadowColor: Colors.amberGlow, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 8 },
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
  // Forecast card
  forecastCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#102D39",
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(212,175,106,0.35)",
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  forecastLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  forecastIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(212,175,106,0.18)", alignItems: "center", justifyContent: "center" },
  forecastLabel: { color: "#E9C77E", fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.9 },
  forecastAmount: { color: "#FFFFFF", fontSize: 22, fontWeight: "900", marginTop: 2 },
  forecastSub: { color: "rgba(255,255,255,0.65)", fontSize: 10, fontWeight: "700", marginTop: 2 },
  forecastConfBadge: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, alignItems: "center", justifyContent: "center" },
  forecastConfPct: { fontSize: 20, fontWeight: "900" },
  forecastConfLabel: { fontSize: 9, fontWeight: "900", textTransform: "uppercase", marginTop: 2 },
});
