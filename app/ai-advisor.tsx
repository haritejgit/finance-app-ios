import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/auth-context";
import { getDashboardAnalytics } from "../src/finance-analytics";
import { askGemini, BusinessStats } from "../src/gemini";
import { getAllTimeTotals } from "../src/repository";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
};

const QUICK_PROMPTS = [
  "What should I follow up today?",
  "How can I recover dues faster?",
  "Should I give new loans this week?",
  "Which collections need attention?",
  "How is this month going?",
  "What risk should I reduce first?",
];

const CACHE_KEY = "aiInsightsCache";
const CACHE_TTL = 60 * 60 * 1000;

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatMoney(value: number) {
  return `Rs.${Math.round(value || 0).toLocaleString("en-IN")}`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function hasGeminiKey() {
  const key = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  return !!key && key !== "your_key_here";
}

async function loadBusinessStats(userId: string): Promise<BusinessStats> {
  const [analytics, allTime] = await Promise.all([getDashboardAnalytics(userId), getAllTimeTotals()]);
  return {
    totalCustomers: analytics.totals.customerCount,
    activeLoans: analytics.totals.activeLoanCount,
    todayCollection: analytics.totals.collectionToday,
    monthCollection: analytics.totals.monthlyRevenue,
    overdueCount: analytics.dueAlerts.length,
    monthDistributed: analytics.totals.distributedThisMonth,
    totalDistributed: allTime.distributed,
    totalCollected: allTime.collected,
  };
}

async function getCachedOrFreshInsights(stats: BusinessStats): Promise<string> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) {
      const { text, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL) return text;
    }
  } catch {
    // Cache is only an optimization.
  }
  const fresh = await askGemini("Give me 3 quick business insights for this week", stats);
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ text: fresh, timestamp: Date.now() })).catch(() => undefined);
  return fresh;
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const paragraphs = message.text.split("\n").filter((line) => line.trim().length > 0);

  return (
    <View style={[styles.messageBlock, isUser ? styles.messageBlockUser : styles.messageBlockAi]}>
      <View style={styles.messageMeta}>
        {!isUser ? (
          <View style={styles.assistantAvatar}>
            <Ionicons name="sparkles-outline" size={15} color="#2563EB" />
          </View>
        ) : null}
        <Text style={styles.messageLabel}>{isUser ? "You" : "AI Advisor"}</Text>
        <Text style={styles.messageTime}>{formatTime(message.timestamp)}</Text>
      </View>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
        {paragraphs.map((paragraph, index) => (
          <Text key={`${message.id}-${index}`} style={[styles.messageText, isUser ? styles.userText : styles.aiText]}>
            {paragraph}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default function AIAdvisorScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [stats, setStats] = useState<BusinessStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const apiReady = hasGeminiKey();

  const addAssistantMessage = useCallback((text: string) => {
    setMessages((current) => [...current, { id: makeId(), role: "assistant", text, timestamp: Date.now() }]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const run = async () => {
        if (!user) {
          setBooting(false);
          setStats(null);
          return;
        }
        setBooting(true);
        const nextStats = await loadBusinessStats(user.uid);
        if (cancelled) return;
        setStats(nextStats);
        if (!apiReady) {
          setBooting(false);
          return;
        }
        const insights = await getCachedOrFreshInsights(nextStats);
        if (!cancelled) {
          setMessages((current) =>
            current.length
              ? current
              : [{ id: makeId(), role: "assistant", text: `Today's quick read:\n${insights}`, timestamp: Date.now() }]
          );
          setBooting(false);
        }
      };
      run().catch(() => {
        if (!cancelled) {
          addAssistantMessage("AI is unavailable right now. Check your connection and API key.");
          setBooting(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [addAssistantMessage, apiReady, user])
  );

  const send = useCallback(async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || loading || !stats || !apiReady) return;
    setMessages((current) => [...current, { id: makeId(), role: "user", text, timestamp: Date.now() }]);
    setInput("");
    setLoading(true);
    const answer = await askGemini(text, stats);
    setMessages((current) => [...current, { id: makeId(), role: "assistant", text: answer, timestamp: Date.now() }]);
    setLoading(false);
  }, [apiReady, input, loading, stats]);

  const canSend = useMemo(() => input.trim().length > 0 && !loading && !!stats && apiReady, [apiReady, input, loading, stats]);
  const statusText = !apiReady ? "Setup needed" : booting ? "Loading" : "Ready";

  return (
    <LinearGradient colors={["#07111F", "#102A43", "#143C5C"]} style={styles.root}>
      <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.safe}>
          <View style={styles.header}>
            <Pressable accessibilityLabel="Go back" style={styles.iconButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={20} color="#0F172A" />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>Finance workspace</Text>
              <Text style={styles.title}>AI Business Advisor</Text>
            </View>
            <View style={[styles.statusPill, !apiReady && styles.statusPillWarning]}>
              <View style={[styles.statusDot, !apiReady && styles.statusDotWarning]} />
              <Text style={[styles.statusText, !apiReady && styles.statusTextWarning]}>{statusText}</Text>
            </View>
          </View>

          <View style={styles.contextCard}>
            <View style={styles.contextHeader}>
              <View>
                <Text style={styles.contextTitle}>Business Context</Text>
                <Text style={styles.contextSub}>Used for every AI answer</Text>
              </View>
              <Pressable accessibilityLabel="Clear chat" style={styles.clearButton} onPress={() => setMessages([])}>
                <Ionicons name="trash-outline" size={17} color="#64748B" />
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statRow}>
              <StatPill label="Today" value={formatMoney(stats?.todayCollection ?? 0)} />
              <StatPill label="Month" value={formatMoney(stats?.monthCollection ?? 0)} />
              <StatPill label="Overdue" value={`${stats?.overdueCount ?? 0}`} />
              <StatPill label="Active loans" value={`${stats?.activeLoans ?? 0}`} />
            </ScrollView>
            {!apiReady ? (
              <View style={styles.setupNotice}>
                <Ionicons name="key-outline" size={17} color="#B45309" />
                <Text style={styles.setupText}>Add EXPO_PUBLIC_GEMINI_API_KEY to your build environment to enable chat.</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.promptSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promptRow}>
              {QUICK_PROMPTS.map((prompt) => (
                <Pressable
                  key={prompt}
                  disabled={!stats || !apiReady || loading}
                  style={({ pressed }) => [styles.promptChip, pressed && styles.pressed, (!stats || !apiReady || loading) && styles.disabled]}
                  onPress={() => send(prompt)}
                >
                  <Text style={styles.promptText}>{prompt}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.chat}
            contentContainerStyle={styles.chatContent}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 && !loading && !booting ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="sparkles-outline" size={26} color="#2563EB" />
                </View>
                <Text style={styles.emptyTitle}>{apiReady ? "Ask a finance question" : "AI setup is pending"}</Text>
                <Text style={styles.emptySub}>
                  {apiReady
                    ? "Use the quick prompts or ask about collections, dues, renewals, and risk."
                    : "The screen is ready. Add the Gemini API key before sending messages."}
                </Text>
              </View>
            ) : null}

            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {(loading || booting) && (
              <View style={[styles.messageBlock, styles.messageBlockAi]}>
                <View style={styles.messageMeta}>
                  <View style={styles.assistantAvatar}>
                    <Ionicons name="sparkles-outline" size={15} color="#2563EB" />
                  </View>
                  <Text style={styles.messageLabel}>AI Advisor</Text>
                </View>
                <View style={[styles.bubble, styles.aiBubble, styles.loadingBubble]}>
                  <ActivityIndicator color="#2563EB" />
                  <Text style={styles.loadingText}>{booting ? "Loading business context" : "Thinking"}</Text>
                </View>
              </View>
            )}
          </ScrollView>

          <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={apiReady ? "Ask about dues, loans, or collections..." : "Add API key to enable AI chat"}
              placeholderTextColor="#94A3B8"
              style={styles.input}
              multiline
              editable={apiReady && !!stats}
            />
            <Pressable style={[styles.sendButton, !canSend && styles.sendButtonDisabled]} disabled={!canSend} onPress={() => send()}>
              <Ionicons name="paper-plane" size={19} color="#FFFFFF" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    marginHorizontal: 14,
    marginTop: 8,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconButton: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#E0F2FE" },
  headerCopy: { flex: 1 },
  eyebrow: { color: "#64748B", fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  title: { color: "#0F172A", fontSize: 21, lineHeight: 25, fontWeight: "900" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, backgroundColor: "#DCFCE7", paddingHorizontal: 10, paddingVertical: 7 },
  statusPillWarning: { backgroundColor: "#FEF3C7" },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#16A34A" },
  statusDotWarning: { backgroundColor: "#F59E0B" },
  statusText: { color: "#15803D", fontSize: 11, fontWeight: "900" },
  statusTextWarning: { color: "#B45309" },
  contextCard: { marginHorizontal: 14, marginTop: 10, borderRadius: 18, backgroundColor: "#FFFFFF", padding: 13, gap: 11 },
  contextHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  contextTitle: { color: "#0F172A", fontSize: 17, fontWeight: "900" },
  contextSub: { color: "#64748B", fontSize: 11, fontWeight: "800", marginTop: 1 },
  clearButton: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F5F9" },
  statRow: { gap: 8 },
  statPill: { minWidth: 92, borderRadius: 14, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", paddingHorizontal: 10, paddingVertical: 10 },
  statValue: { color: "#0F172A", fontSize: 15, fontWeight: "900" },
  statLabel: { color: "#64748B", fontSize: 10, fontWeight: "900", marginTop: 2, textTransform: "uppercase" },
  setupNotice: { borderRadius: 13, backgroundColor: "#FEF3C7", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 11, paddingVertical: 10 },
  setupText: { flex: 1, color: "#92400E", fontSize: 12, lineHeight: 17, fontWeight: "800" },
  promptSection: { marginTop: 10 },
  promptRow: { gap: 8, paddingHorizontal: 14, paddingBottom: 2 },
  promptChip: { borderRadius: 999, backgroundColor: "#E0F2FE", borderWidth: 1, borderColor: "#BAE6FD", paddingHorizontal: 13, paddingVertical: 9 },
  promptText: { color: "#075985", fontSize: 12, fontWeight: "900" },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  chat: { flex: 1, marginTop: 8 },
  chatContent: { flexGrow: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22 },
  emptyIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  emptyTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "900", textAlign: "center" },
  emptySub: { color: "#CBD5E1", fontSize: 13, lineHeight: 19, fontWeight: "800", textAlign: "center", marginTop: 6, maxWidth: 320 },
  messageBlock: { maxWidth: "88%", gap: 5 },
  messageBlockUser: { alignSelf: "flex-end", alignItems: "flex-end" },
  messageBlockAi: { alignSelf: "flex-start", alignItems: "flex-start" },
  messageMeta: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4 },
  assistantAvatar: { width: 24, height: 24, borderRadius: 9, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" },
  messageLabel: { color: "#CBD5E1", fontSize: 11, fontWeight: "900" },
  messageTime: { color: "#94A3B8", fontSize: 10, fontWeight: "800" },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, gap: 7 },
  userBubble: { backgroundColor: "#2563EB", borderBottomRightRadius: 5 },
  aiBubble: { backgroundColor: "#FFFFFF", borderBottomLeftRadius: 5 },
  loadingBubble: { minWidth: 160, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { color: "#475569", fontSize: 12, fontWeight: "900" },
  messageText: { fontSize: 14, lineHeight: 20, fontWeight: "700" },
  userText: { color: "#FFFFFF" },
  aiText: { color: "#0F172A" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  input: {
    flex: 1,
    maxHeight: 112,
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    color: "#0F172A",
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
    fontWeight: "700",
  },
  sendButton: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#2563EB" },
  sendButtonDisabled: { backgroundColor: "#94A3B8" },
});
