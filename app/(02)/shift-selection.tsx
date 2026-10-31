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
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }, width < 500 && styles.panelCompact, width >= 1024 && styles.panelWide]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionCopy}>
          <Text style={[styles.sectionTitle, width < 500 && styles.sectionTitleCompact, { color: colors.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.sectionSub, width < 500 && styles.sectionSubCompact, { color: colors.textMuted }]}>{subtitle}</Text> : null}
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
}: {
  title: string;
  value: string;
  icon: string;
  tone: string;
  caption: string;
  valueTone?: string;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  return (
    <View style={[styles.metricCard, width < 500 && styles.metricCardCompact, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.metricIcon, width < 500 && styles.metricIconCompact, { backgroundColor: `${tone}18` }]}>
        <Icon name={icon} size={17} color={tone} />
      </View>
      <Text style={[styles.metricTitle, { color: colors.textMuted }]}>{title}</Text>
      <Text style={[styles.metricValue, width < 500 && styles.metricValueCompact, valueTone ? { color: valueTone } : null]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
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
  const { colors } = useTheme();
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.bottomNavButton, pressed && styles.pressed]}>
      <Icon name={icon} size={18} color={active ? colors.primary : colors.textMuted} />
      <Text style={[styles.bottomNavText, { color: colors.textMuted }, active && [styles.bottomNavTextActive, { color: colors.text }]]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{label}</Text>
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
  const [bottomNavWidth, setBottomNavWidth] = useState(0);
  const [activeBottomKey, setActiveBottomKey] = useState("account");

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
  const todayLabel = useMemo(() => new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" }), []);
  const bottomActions = useMemo(
    () => {
      const actions: BottomAction[] = [
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
            contentContainerStyle={[styles.container, { paddingHorizontal: viewportWidth >= 900 ? 28 : 16, paddingVertical: viewportWidth < 500 ? 14 : 24, paddingBottom: viewportWidth < 500 ? 28 : 44 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          >
            <Animated.View
              style={[
                styles.content,
                {
                  maxWidth: Math.min(viewportWidth - (viewportWidth >= 900 ? 56 : 32), 1180),
                  gap: viewportWidth >= 900 ? 18 : viewportWidth < 500 ? 10 : 14,
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
                <View style={[styles.headerTop, viewportWidth < 500 && styles.headerTopCompact]}>
                  <View style={[styles.brandRow, viewportWidth < 500 && styles.brandRowCompact]}>
                  <View style={[styles.brandIcon, viewportWidth < 500 && styles.brandIconCompact, { backgroundColor: "rgba(255,255,255,0.12)" }]}>
                      <Icon name="business-outline" size={20} color={colors.honeyBronze} />
                    </View>
                    <View style={styles.headerCopy}>
                      <Text numberOfLines={1} style={[styles.eyebrow, viewportWidth < 500 && styles.eyebrowCompact, { color: "#9FB2C9" }]}>{t("premiumWorkspace")}</Text>
                      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.header, viewportWidth < 500 && styles.headerTextCompact, { color: colors.white }]}>{t("financeDashboard")}</Text>
                      <Text style={[styles.welcome, viewportWidth < 500 && styles.welcomeCompact, { color: "#C0D0D0" }]}>{getGreeting(t)}, {displayName} · {todayLabel}</Text>
                    </View>
                  </View>
                  <Pressable accessibilityLabel={t("searchCustomers")} style={[styles.searchButton, viewportWidth < 500 && styles.searchButtonCompact, { backgroundColor: colors.honeyBronze }]} onPress={openCustomerSearch}>
                    <Icon name="search" size={20} color={Colors.nearBlack} />
                  </Pressable>
                </View>

                <Pressable style={[styles.todayCard, viewportWidth < 500 && styles.todayCompact, { backgroundColor: colors.lightSeaGreen, borderColor: "rgba(255,255,255,0.16)" }]} onPress={() => nav.push("/graph")}>
                  <View style={[styles.todayIcon, viewportWidth < 500 && styles.todayIconCompact, { backgroundColor: "rgba(255,255,255,0.14)" }]}>
                    <Icon name="cash-outline" size={20} color={colors.white} />
                  </View>
                  <View style={styles.todayCopy}>
                    <Text style={[styles.todayLabel, viewportWidth < 500 && styles.todayLabelCompact, { color: "rgba(255,255,255,0.76)" }]}>{t("collectedToday")}</Text>
                    <Text style={[styles.todayValue, viewportWidth < 500 && styles.todayValueCompact, { color: colors.white }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{formatMoney(totals?.collectionToday ?? 0)}</Text>
                    <Text style={[styles.todayHint, viewportWidth < 500 && styles.todayHintCompact, { color: "rgba(255,255,255,0.78)" }]}>{t("distributedTodayHint")} {formatMoney(totals?.distributedToday ?? 0)}</Text>
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
                          <Text style={[styles.progressDetailText, { color: colors.textMuted }]}>
                            Paid: <Text style={{fontWeight: "800", color: Colors.lightSeaGreen}}>{formatMoney(routeProgress.collected)}</Text>
                            {routeProgress.dueAmount > 0 && (
                              <> • Dues: <Text style={{fontWeight: "900", color: "#d94841"}}>{formatMoney(routeProgress.dueAmount)}</Text></>
                            )}
                            {" "}/ {formatMoney(routeProgress.target)}
                          </Text>
                          {remainingCustomers > 0 ? (
                            <Text style={[styles.progressHintText, { color: colors.textMuted }]}>
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

                  <View style={[styles.metricGrid, viewportWidth >= 1024 && styles.panelWide]}>
                    {isOwner ? (
                      <>
                        <DashboardMetric title={t("balance")} value={formatMoney(balance)} caption={t("collectedMinusPending")} icon="cash-outline" tone="#B03A3A" valueTone="#B03A3A" />
                        <DashboardMetric title={t("income")} value={formatMoney(totals?.monthlyRevenue ?? 0)} caption={t("collectedThisMonth")} icon="trending-up-outline" tone={Colors.success} valueTone={Colors.success} />
                        <DashboardMetric title={t("expense")} value={formatMoney(totals?.distributedThisMonth ?? 0)} caption={t("distributedThisMonth")} icon="arrow-down-outline" tone="#9A6B1E" valueTone="#9A6B1E" />
                        <DashboardMetric title="Current Amount" value={formatMoney(mainCurrentAmount)} caption="BF + invested + collection - dist. - exp." icon="alert-triangle-outline" tone="#B03A3A" valueTone="#B03A3A" />
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

                  <View
                    style={[styles.bottomNav, { width: "100%", backgroundColor: colors.card, borderColor: colors.border }]}
                    onLayout={(event) => setBottomNavWidth(event.nativeEvent.layout.width)}
                  >
                    {bottomNavItemWidth > 0 ? (
                      <Animated.View
                        pointerEvents="none"
                        style={[
                          styles.bottomNavIndicator,
                          { backgroundColor: colors.primarySoft },
                          {
                            width: bottomNavItemWidth,
                            transform: [{ translateX: bottomNavSlide }],
                          },
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
            style={[styles.aiFab, viewportWidth < 500 && styles.aiFabCompact]}
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
  headerCard: {
    backgroundColor: Colors.white,
    borderRadius: 28,
    padding: 22,
    gap: 18,
    shadowColor: "#102D39",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 7,
  },
  headerCompact: { borderRadius: 20, padding: 13, gap: 10 },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  headerTopCompact: { gap: 10 },
  brandRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 14 },
  brandRowCompact: { gap: 10 },
  brandIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: Colors.frozenWater, alignItems: "center", justifyContent: "center" },
  brandIconCompact: { width: 38, height: 38, borderRadius: 13 },
  headerCopy: { flex: 1 },
  eyebrow: { color: Colors.textMuted, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.1 },
  eyebrowCompact: { fontSize: 9, letterSpacing: 0.8 },
  header: { color: Colors.nearBlack, fontSize: 29, lineHeight: 35, fontWeight: "800", marginTop: 4 },
  headerTextCompact: { fontSize: 19, lineHeight: 23, marginTop: 1 },
  welcome: { color: "#426c67", fontSize: 13, marginTop: 4, fontWeight: "600" },
  welcomeCompact: { fontSize: 11, marginTop: 2 },
  searchButton: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: Colors.lightSeaGreen },
  searchButtonCompact: { width: 44, height: 44, borderRadius: 14 },
  todayCard: { minHeight: 102, borderRadius: 21, backgroundColor: "#f6fffe", flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 18, paddingVertical: 16, borderWidth: 1, borderColor: Colors.borderLight },
  todayCompact: { minHeight: 72, borderRadius: 15, gap: 10, paddingHorizontal: 12, paddingVertical: 9 },
  todayIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: Colors.honeyBronze, alignItems: "center", justifyContent: "center" },
  todayIconCompact: { width: 38, height: 38, borderRadius: 13 },
  todayCopy: { flex: 1 },
  todayLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.9 },
  todayLabelCompact: { fontSize: 10, letterSpacing: 0.7 },
  todayValue: { color: Colors.nearBlack, fontSize: 33, lineHeight: 39, fontWeight: "800", marginTop: 2 },
  todayValueCompact: { fontSize: 24, lineHeight: 28, marginTop: 0 },
  todayHint: { color: "#426c67", fontSize: 12, fontWeight: "600", marginTop: 2 },
  todayHintCompact: { fontSize: 10, marginTop: 0 },
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
  panelCompact: { borderRadius: 17, padding: 13, gap: 10 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  sectionCopy: { flex: 1 },
  sectionTitle: { color: Colors.nearBlack, fontSize: 16, lineHeight: 21, fontWeight: "800" },
  sectionSub: { color: Colors.textMuted, fontSize: 11, fontWeight: "500", marginTop: 2 },
  sectionTitleCompact: { fontSize: 14, lineHeight: 18 },
  sectionSubCompact: { fontSize: 10, marginTop: 1 },
  routeMeta: { color: "#6B7A8D", fontSize: 12, fontWeight: "700" },
  controlLabel: { color: "#9AA6B2", fontSize: 10.5, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.3 },
  dayGrid: { flexDirection: "row", gap: 6 },
  dayGridCompact: { flexWrap: "wrap" },
  dayChip: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: Colors.borderLight, borderRadius: 12, paddingVertical: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#F7FAF9", minWidth: 38 },
  dayChipCompact: { flexBasis: "22%", minWidth: 54 },
  dayChipOn: { backgroundColor: Colors.lightSeaGreen, borderColor: Colors.lightSeaGreen },
  dayChipText: { color: "#4D666D", fontSize: 12, fontWeight: "700" },
  dayChipTextOn: { color: "#FFFFFF", fontWeight: "800" },
  shiftRow: { flexDirection: "row", gap: 10 },
  shift: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: "#F7FAF9", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, paddingHorizontal: 8 },
  shiftOn: { backgroundColor: Colors.lightSeaGreen, borderColor: Colors.lightSeaGreen },
  shiftText: { color: "#4D666D", fontWeight: "700", fontSize: 13 },
  shiftTextOn: { color: "#FFFFFF", fontWeight: "800" },
  primaryAction: { backgroundColor: Colors.lightSeaGreen, borderRadius: 12, minHeight: 46, paddingVertical: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryActionText: { color: Colors.white, fontWeight: "800", fontSize: 14 },
  walletRouteSummary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 2 },
  walletRouteText: { color: Colors.textMuted, fontSize: 11, fontWeight: "800" },
  walletRouteDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.borderLight },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metricCard: { flexGrow: 1, flexBasis: "46%", minWidth: 150, minHeight: 132, borderRadius: 18, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: Colors.borderLight, padding: 18 },
  metricCardCompact: { minWidth: 142, minHeight: 112, borderRadius: 15, padding: 13 },
  metricIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  metricIconCompact: { width: 29, height: 29, borderRadius: 10, marginBottom: 8 },
  metricTitle: { color: Colors.textMuted, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 },
  metricValue: { color: Colors.nearBlack, fontSize: 21, lineHeight: 27, fontWeight: "800", marginTop: 5 },
  metricValueCompact: { fontSize: 18, lineHeight: 22, marginTop: 3 },
  metricCaption: { color: Colors.textMuted, fontSize: 11, fontWeight: "500", marginTop: 2 },
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
  bottomNav: { position: "relative", flexDirection: "row", justifyContent: "space-between", backgroundColor: "#FFFFFF", borderRadius: 19, borderWidth: 1, borderColor: Colors.borderLight, padding: 7, overflow: "hidden", shadowColor: "#102D39", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2 },
  bottomNavIndicator: { position: "absolute", top: 7, bottom: 7, left: 7, borderRadius: 13, backgroundColor: "#EAF4F1" },
  bottomNavButton: { flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 0, alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: 2, paddingVertical: 5, zIndex: 1 },
  bottomNavText: { color: "#70838A", fontSize: 10.5, fontWeight: "600", textAlign: "center" },
  bottomNavTextActive: { color: Colors.nearBlack, fontWeight: "800" },
  progressCard: { backgroundColor: "#fafbfc", borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: Colors.borderLight },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  progressTitle: { fontSize: 12, fontWeight: "900", color: Colors.nearBlack },
  progressPercentText: { fontSize: 13, fontWeight: "900", color: Colors.lightSeaGreen },
  progressBarBg: { height: 8, backgroundColor: "#e2e8f0", borderRadius: 4, overflow: "hidden", marginBottom: 8, flexDirection: "row" },
  progressBarFill: { height: "100%", borderRadius: 4 },
  progressDetails: { gap: 2 },
  progressDetailText: { fontSize: 11, fontWeight: "800", color: Colors.textMuted },
  progressHintText: { fontSize: 10, fontWeight: "800", color: Colors.amberGlow },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
  skeletonPanel: { width: "100%", backgroundColor: Colors.white, borderRadius: 18, borderWidth: 1, borderColor: Colors.borderLight, padding: 16, gap: 14 },
  skeletonLine: { height: 16, borderRadius: 999, backgroundColor: "#DCE6F7" },
  searchModalSafe: { flex: 1 },
  searchModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 11, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#DCE6F7" },
  searchModalTitle: { color: "#111827", fontSize: 19, fontWeight: "700" },
  searchCloseBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
  searchModalContent: { flex: 1, padding: 13 },
  customerSearchShell: { flexDirection: "row", alignItems: "center", gap: 9, borderRadius: 13, borderWidth: 1, borderColor: "#DCE6F7", backgroundColor: "#FFFFFF", paddingHorizontal: 11, marginBottom: 8 },
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
  searchCustomerRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 13, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: "#DCE6F7", backgroundColor: "#FFFFFF" },
  searchCustomerInfo: { flex: 1 },
  searchCustomerName: { color: "#111827", fontSize: 14, fontWeight: "700" },
  searchCustomerMeta: { color: "#6B7280", fontSize: 12, fontWeight: "500", marginTop: 2 },
  searchCustomerPhone: { color: "#9CA3AF", fontSize: 12, marginTop: 2 },
  statePill: { color: Colors.lightSeaGreen, backgroundColor: Colors.frozenWater, fontSize: 10, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, overflow: "hidden", textTransform: "uppercase" },
  aiFab: { position: "absolute", right: 18, bottom: 24, width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", backgroundColor: Colors.amberGlow, shadowColor: Colors.amberGlow, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 8 },
  aiFabCompact: { right: 14, bottom: 14, width: 50, height: 50, borderRadius: 25 },
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
  expenseModal: { borderTopLeftRadius: 21, borderTopRightRadius: 21, padding: 20, paddingBottom: 28, gap: 9 },
  expenseModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  expenseModalTitle: { fontSize: 18, fontWeight: "800" },
  expenseModalLabel: { fontSize: 13, fontWeight: "600", marginTop: 4 },
  expenseInput: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15 },
  expenseSaveBtn: { minHeight: 46, backgroundColor: Colors.danger, borderRadius: 12, paddingVertical: 12, alignItems: "center", justifyContent: "center", marginTop: 6 },
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
