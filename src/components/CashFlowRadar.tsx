import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { saveMinimumCashReserve } from "../repository";
import type { DashboardAnalytics } from "../finance-analytics";
import { projectRadarBalance } from "../cash-flow-radar";
import { useTheme } from "../theme-context";

const fmt = (value: number) => `₹${Math.round(value || 0).toLocaleString("en-IN")}`;
function withdrawalsInDays(plans: any[], days: number, now: number) {
  const end = now + days * 24 * 60 * 60 * 1000;
  return plans.reduce((sum, plan) => {
    if (plan.status !== "active" || plan.withdrawalStartDate > end || (plan.endDate && plan.endDate < now)) return sum;
    const cursor = new Date(now);
    cursor.setDate(1); cursor.setHours(0, 0, 0, 0);
    const lastMonth = new Date(end); lastMonth.setDate(1); lastMonth.setHours(0, 0, 0, 0);
    let total = 0;
    for (let month = 0; cursor <= lastMonth && month < 13; month++, cursor.setMonth(cursor.getMonth() + 1)) {
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
      if (plan.withdrawalStartDate <= monthEnd && (!plan.endDate || plan.endDate >= cursor.getTime())) total += Math.max(0, Number(plan.monthlyWithdrawal || 0));
    }
    return sum + total;
  }, 0);
}

export function CashFlowRadar({ analytics, userId }: { analytics: DashboardAnalytics; userId: string }) {
  const { colors } = useTheme();
  const [reserve, setReserve] = useState(0);
  const [reserveInput, setReserveInput] = useState("0");
  const [plans, setPlans] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const planSignature = JSON.stringify(analytics.cashFlowRadar?.investmentPlans || []);

  useEffect(() => {
    const saved = Math.max(0, Number(analytics.cashFlowRadar?.minimumReserve || 0));
    setReserve(saved);
    setReserveInput(String(saved));
    setPlans(JSON.parse(planSignature));
  }, [analytics.cashFlowRadar?.minimumReserve, planSignature]);

  const currentCash = analytics.totals.cashWalletBalance + analytics.totals.phonePeWalletBalance;
  const receivables = analytics.totals.pendingAmount;
  const horizons = useMemo(() => ([
    { days: 7, collection: analytics.cashFlowRadar?.expectedNext7Days ?? 0 },
    { days: 30, collection: analytics.cashFlowRadar?.expectedNext30Days ?? 0 },
    { days: 90, collection: analytics.cashFlowRadar?.expectedNext90Days ?? 0 },
  ].map((item) => {
    const withdrawals = withdrawalsInDays(plans, item.days, Date.now());
    return { ...item, withdrawals, ...projectRadarBalance(currentCash, item.collection, withdrawals, reserve) };
  })), [analytics, plans, currentCash, reserve]);

  const saveReserve = async () => {
    const amount = Number(reserveInput);
    if (!Number.isFinite(amount) || amount < 0) { setMessage("Enter a reserve of zero or more."); return; }
    setSaving(true); setMessage("");
    try { await saveMinimumCashReserve(userId, amount); setReserve(amount); setMessage("Minimum reserve saved."); }
    catch (error: any) { setMessage(error?.message || "Could not save the reserve."); }
    finally { setSaving(false); }
  };

  const styles = useMemo(() => ({
    panel: { width: "100%" as const, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 22, padding: 20, marginBottom: 0 },
    title: { color: colors.text, fontSize: 19, fontWeight: "800" as const },
    muted: { color: colors.textSecondary, fontSize: 12, lineHeight: 19, marginTop: 5 } as const,
    metric: { backgroundColor: colors.surfaceTint, borderRadius: 15, padding: 14, flexGrow: 1, minWidth: "44%" as any, marginTop: 8 },
  }), [colors]);

  return <View style={styles.panel}>
    <Text style={styles.title}>Cash Flow Radar</Text>
    <Text style={styles.muted}>Decision support based on wallet records and current active-loan installment estimates. Expected collections are uncertain and discounted by the recent on-time rate ({analytics.cashFlowRadar?.onTimePercent ?? 0}%). Outstanding receivables are shown separately and are never added to cash.</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
      <View style={styles.metric}><Text style={styles.muted}>Available wallet cash</Text><Text style={styles.title}>{fmt(currentCash)}</Text></View>
      <View style={styles.metric}><Text style={styles.muted}>Outstanding receivables</Text><Text style={styles.title}>{fmt(receivables)}</Text></View>
      {horizons.map((item) => <View key={item.days} style={styles.metric}>
        <Text style={styles.muted}>Estimated net position · {item.days} days</Text>
        <Text style={[styles.title, item.belowMinimum ? { color: colors.error } : null]}>{fmt(item.projectedCash)}</Text>
        <Text style={styles.muted}>Collections {fmt(item.collection)} · planned withdrawals {fmt(item.withdrawals)}</Text>
        {item.belowMinimum ? <Text accessibilityRole="alert" style={{ color: colors.error, fontWeight: "800", fontSize: 12, marginTop: 5 }}>Below your reserve by {fmt(item.shortfallAmount)}</Text> : null}
      </View>)}
    </View>
    <View style={{ marginTop: 14 }}>
      <Text style={styles.muted}>Minimum cash reserve</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
        <TextInput accessibilityLabel="Minimum cash reserve" value={reserveInput} onChangeText={setReserveInput} keyboardType="numeric" style={{ flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTint, color: colors.text, borderRadius: 10, paddingHorizontal: 12, fontSize: 16 }} />
        <Pressable accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.primary, justifyContent: "center" }} disabled={saving} onPress={() => void saveReserve()}><Text style={{ color: colors.white, fontWeight: "800" }}>{saving ? "Saving…" : "Save"}</Text></Pressable>
      </View>
    </View>
    {plans.filter((plan) => plan.status === "active").length > 0 ? <View style={{ marginTop: 10 }}><Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>Planned obligations</Text>{plans.filter((plan) => plan.status === "active").map((plan) => <Text key={plan.id} style={styles.muted}>{plan.name}: {fmt(plan.monthlyWithdrawal)}/month from {new Date(plan.withdrawalStartDate).toLocaleDateString("en-IN")}</Text>)}</View> : <Text style={styles.muted}>No active planned investment withdrawals.</Text>}
    {horizons.some((item) => item.belowMinimum) ? <Text style={{ color: colors.error, fontSize: 13, lineHeight: 19, marginTop: 10 }}>Suggested review: check the overdue customer follow-ups and upcoming route collections before scheduling withdrawals that bring cash below your reserve.</Text> : <Text style={styles.muted}>Suggested review: compare this estimate with upcoming route schedules before making large withdrawals.</Text>}
    <Text style={[styles.muted, { marginTop: 10 }]}>Future scheduled expenses are not recorded by the app, so they are excluded. Forecasts assume the current weekly installment pace and recent payment rate; actual collection dates and receipts can differ.</Text>
    {!analytics.cashFlowRadar?.walletBalanceReliable ? <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 8 }}>Incomplete data: set wallet opening balances and their effective date in Account settings to improve the available-cash estimate.</Text> : null}
    {!!message && <Text style={styles.muted}>{message}</Text>}
  </View>;
}
