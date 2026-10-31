import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, Text, TextInput, View } from "react-native";
import { getInvestmentPlans, removeInvestmentPlan, saveInvestmentPlan } from "../repository";
import type { InvestmentPlan } from "../investment-planning";
import { projectInvestmentPlan } from "../investment-planning";
import { useTheme } from "../theme-context";

const emptyForm = (): Omit<InvestmentPlan, "id" | "updatedAt"> => ({
  name: "", currentBalance: 0, monthlyContribution: 0, annualReturnPercent: 0,
  withdrawalStartDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) as any,
  monthlyWithdrawal: 0, endDate: undefined, minimumBalance: 0, notes: "", status: "active",
});
const money = (value: number | null) => value === null ? "Not yet available" : `₹${Math.round(value).toLocaleString("en-IN")}`;

export function InvestmentPlanningPanel({ userId, currentInvestments }: { userId: string; currentInvestments: number }) {
  const { colors } = useTheme();
  const [plans, setPlans] = useState<InvestmentPlan[]>([]);
  const [form, setForm] = useState<Omit<InvestmentPlan, "id" | "updatedAt">>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [expandedPlans, setExpandedPlans] = useState<Record<string, boolean>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    try { setPlans(await getInvestmentPlans(userId)); }
    catch (e: any) { setError(e?.message || "Could not load your plans."); }
    finally { setLoading(false); }
  }, [userId]);
  useEffect(() => { void reload(); }, [reload]);

  const setField = (key: keyof typeof form, value: string | number) => setForm((current) => ({ ...current, [key]: value }));
  const setAmountField = (key: "currentBalance" | "monthlyContribution" | "annualReturnPercent" | "monthlyWithdrawal" | "minimumBalance", value: string) => setField(key, value === "" ? 0 : Number(value));
  const reset = () => { setForm(emptyForm()); setEditingId(null); setError(""); };

  const onSave = async () => {
    const dateMs = Date.parse(`${String(form.withdrawalStartDate)}T12:00:00`);
    if (!form.name.trim() || !Number.isFinite(form.monthlyWithdrawal) || form.monthlyWithdrawal <= 0 || !Number.isFinite(dateMs)) {
      setError("Enter a plan name, a valid start date, and a positive monthly withdrawal.");
      return;
    }
    const plan: InvestmentPlan = {
      ...form,
      withdrawalStartDate: dateMs,
      endDate: form.endDate ? Date.parse(`${String(form.endDate).slice(0, 10)}T12:00:00`) : undefined,
      id: editingId || `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      updatedAt: Date.now(),
    };
    if (plan.endDate && plan.endDate < plan.withdrawalStartDate) { setError("The end date must be after the withdrawal start date."); return; }
    setSaving(true); setError("");
    try { await saveInvestmentPlan(userId, plan); await reload(); reset(); }
    catch (e: any) { setError(e?.message || "Could not save the plan."); }
    finally { setSaving(false); }
  };

  const beginEdit = (plan: InvestmentPlan) => {
    setEditingId(plan.id);
    setForm({ ...plan, withdrawalStartDate: new Date(plan.withdrawalStartDate).toISOString().slice(0, 10) as any, endDate: plan.endDate ? new Date(plan.endDate).toISOString().slice(0, 10) as any : undefined });
    setError("");
  };
  const remove = (planId: string) => {
    const confirmed = Platform.OS === "web"
      ? window.confirm("Delete this plan? This removes only the plan and does not change investment or loan records.")
      : undefined;
    const execute = async () => { try { await removeInvestmentPlan(userId, planId); setPlans((current) => current.filter((item) => item.id !== planId)); } catch (e: any) { setError(e?.message || "Could not delete the plan."); } };
    if (confirmed === true) void execute();
    else if (confirmed === undefined) Alert.alert("Delete plan?", "This removes only the plan and does not change investment or loan records.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void execute() },
    ]);
  };
  const pauseOrResume = async (plan: InvestmentPlan) => {
    try { await saveInvestmentPlan(userId, { ...plan, status: plan.status === "active" ? "paused" : "active" }); await reload(); }
    catch (e: any) { setError(e?.message || "Could not update the plan."); }
  };

  const styles = useMemo(() => ({
    card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 14 } as const,
    title: { color: colors.text, fontSize: 18, fontWeight: "800" as const },
    copy: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 5 } as const,
    label: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" as const, marginBottom: 5 },
    input: { backgroundColor: colors.surfaceTint, color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, marginBottom: 11 } as const,
    button: { backgroundColor: colors.primary, borderRadius: 10, minHeight: 44, alignItems: "center" as const, justifyContent: "center" as const, paddingHorizontal: 12 } as const,
    buttonText: { color: colors.white, fontSize: 13, fontWeight: "800" as const },
    secondaryButton: { backgroundColor: colors.surfaceTint, borderColor: colors.border, borderWidth: 1, borderRadius: 9, minHeight: 40, alignItems: "center" as const, justifyContent: "center" as const, paddingHorizontal: 10 } as const,
    row: { flexDirection: "row" as const, gap: 8, flexWrap: "wrap" as const, marginTop: 10 },
    stat: { flexGrow: 1, minWidth: "42%" as any, backgroundColor: colors.surfaceTint, borderRadius: 10, padding: 10, marginTop: 8 },
  }), [colors]);

  const Field = ({ label, value, onChangeText, numeric = false, placeholder = "", maxLength }: { label: string; value: string; onChangeText: (text: string) => void; numeric?: boolean; placeholder?: string; maxLength?: number }) => (
    <View><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} keyboardType={numeric ? "numeric" : "default"} placeholder={placeholder} placeholderTextColor={colors.textMuted} style={styles.input} maxLength={maxLength} /></View>
  );

  return <View style={styles.card}>
    <Text style={styles.title}>Investment withdrawal planner</Text>
    <Text style={styles.copy}>Plans are estimates kept separate from your loan ledger. A plan’s starting balance is manual unless you set it yourself; existing investment entries are shown only as a reference.</Text>
    <View style={[styles.stat, { marginTop: 12 }]}><Text style={styles.label}>Recorded investment entries (reference)</Text><Text style={styles.title}>{money(currentInvestments)}</Text></View>
    <View style={{ marginTop: 12 }}>
      <Field label="Plan or reserve name" value={form.name} onChangeText={(v) => setField("name", v)} placeholder="e.g. Emergency reserve" maxLength={120} />
      <Field label="Starting reserve balance (manual)" value={String(form.currentBalance || "")} onChangeText={(v) => setAmountField("currentBalance", v)} numeric placeholder="0" />
      <Field label="Monthly contribution until withdrawals start" value={String(form.monthlyContribution || "")} onChangeText={(v) => setAmountField("monthlyContribution", v)} numeric placeholder="0" />
      <Field label="Expected annual return (%) — estimate" value={String(form.annualReturnPercent || "")} onChangeText={(v) => setAmountField("annualReturnPercent", v)} numeric placeholder="0" />
      <Field label="Withdrawal start date (YYYY-MM-DD)" value={String(form.withdrawalStartDate)} onChangeText={(v) => setField("withdrawalStartDate", v)} placeholder="YYYY-MM-DD" />
      <Field label="Desired monthly withdrawal" value={String(form.monthlyWithdrawal || "")} onChangeText={(v) => setAmountField("monthlyWithdrawal", v)} numeric placeholder="200000" />
      <Field label="Optional plan end date (YYYY-MM-DD)" value={form.endDate ? String(form.endDate).slice(0, 10) : ""} onChangeText={(v) => setField("endDate", v)} placeholder="Leave empty for no end date" />
      <Field label="Emergency reserve / minimum balance" value={String(form.minimumBalance || "")} onChangeText={(v) => setAmountField("minimumBalance", v)} numeric placeholder="0" />
      <Field label="Notes" value={form.notes} onChangeText={(v) => setField("notes", v)} placeholder="Optional assumptions" maxLength={1000} />
      {!!error && <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 13, marginBottom: 10 }}>{error}</Text>}
      <View style={styles.row}>
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => void onSave()} disabled={saving}><Text style={styles.buttonText}>{saving ? "Saving…" : editingId ? "Save changes" : "Create plan"}</Text></Pressable>
        {editingId ? <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={reset}><Text style={{ color: colors.text, fontWeight: "700" }}>Cancel edit</Text></Pressable> : null}
      </View>
    </View>
    {loading ? <ActivityIndicator color={colors.primary} style={{ margin: 18 }} /> : plans.length === 0 ? <Text style={styles.copy}>No plans yet. Create one above to see a month-by-month estimate.</Text> : plans.map((plan) => {
      const projection = projectInvestmentPlan(plan);
      const shownRows = projection.rows.slice(0, expandedPlans[plan.id] ? 240 : 24);
      const maxBalance = Math.max(1, ...shownRows.map((row) => row.balance));
      return <View key={plan.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: 16, paddingTop: 14 }}>
        <Text style={styles.title}>{plan.name} · {plan.status === "active" ? "Active" : "Paused"}</Text>
        {!!plan.notes && <Text style={styles.copy}>{plan.notes}</Text>}
        <View style={styles.row}>
          <View style={styles.stat}><Text style={styles.label}>Available at start (estimate)</Text><Text style={styles.title}>{money(projection.availableOnStart)}</Text></View>
          <View style={styles.stat}><Text style={styles.label}>Desired monthly withdrawal</Text><Text style={styles.title}>{money(plan.monthlyWithdrawal)}</Text></View>
          <View style={styles.stat}><Text style={styles.label}>Time until start</Text><Text style={styles.title}>{projection.monthsUntilStart ? `${projection.monthsUntilStart} months` : "Started"}</Text></View>
          <View style={styles.stat}><Text style={styles.label}>Supportable withdrawals</Text><Text style={styles.title}>~{projection.withdrawalMonths} months</Text></View>
          <View style={styles.stat}><Text style={styles.label}>Projected balance at depletion/end</Text><Text style={styles.title}>{money(projection.estimatedRemainingBalance)}</Text></View>
        </View>
        {projection.firstShortfallDate ? <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 13, marginTop: 10 }}>Warning: this withdrawal would breach the minimum reserve around {new Date(projection.firstShortfallDate).toLocaleDateString("en-IN")}.</Text> : <Text style={{ color: plan.status === "active" ? colors.success : colors.textSecondary, fontSize: 13, marginTop: 10 }}>{plan.status === "paused" ? "Paused: projected withdrawals are not applied." : projection.projectionIncomplete ? "The model does not extend to the withdrawal date." : projection.isSustainable ? "No reserve breach within the modeled period." : "The plan cannot be modeled as sustainable."}</Text>}
        <Text style={styles.copy}>Assumptions: no inflation or tax; returns are estimates; contributions stop when withdrawals begin; amounts are not guaranteed. Actual scheduled expenses and other investments are not automatically attributed to this reserve.</Text>
        <View style={{ marginTop: 8 }}>{shownRows.map((row) => <View key={row.date} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 }}><Text style={{ color: colors.textSecondary, width: 54, fontSize: 11 }}>{new Date(row.date).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}</Text><View style={{ height: 10, width: `${Math.max(2, (row.balance / maxBalance) * 100)}%` as any, backgroundColor: colors.primary, borderRadius: 5 }} /><Text style={{ color: colors.text, fontSize: 11 }}>{money(row.balance)}</Text></View>)}</View>
        {projection.rows.length > 24 ? <Pressable accessibilityRole="button" onPress={() => setExpandedPlans((current) => ({ ...current, [plan.id]: !current[plan.id] }))} style={{ paddingVertical: 9 }}><Text style={{ color: colors.primary, fontWeight: "800", fontSize: 12 }}>{expandedPlans[plan.id] ? "Show fewer months" : "Show full month-by-month projection"}</Text></Pressable> : null}
        <View style={styles.row}>
          <Pressable style={styles.secondaryButton} onPress={() => beginEdit(plan)}><Text style={{ color: colors.text, fontWeight: "700" }}>Edit</Text></Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => void pauseOrResume(plan)}><Text style={{ color: colors.text, fontWeight: "700" }}>{plan.status === "active" ? "Pause" : "Resume"}</Text></Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => remove(plan.id)}><Text style={{ color: colors.error, fontWeight: "700" }}>Delete</Text></Pressable>
        </View>
      </View>;
    })}
  </View>;
}
