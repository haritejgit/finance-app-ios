import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
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
import { Colors, Gradients } from "../src/theme";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
};

const QUICK_PROMPTS = [
  "How to recover dues faster?",
  "Should I give new loans this week?",
  "Which day has best collections?",
  "Tips to reduce defaults",
  "How is my business this month?",
  "Who are my riskiest customers?",
];

const CACHE_KEY = "aiInsightsCache";
const CACHE_TTL = 60 * 60 * 1000;

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
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

export default function AIAdvisorScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [stats, setStats] = useState<BusinessStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);

  const addAssistantMessage = useCallback((text: string) => {
    setMessages((current) => [...current, { id: makeId(), role: "assistant", text, timestamp: Date.now() }]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const run = async () => {
        if (!user) {
          setBooting(false);
          return;
        }
        setBooting(true);
        const nextStats = await loadBusinessStats(user.uid);
        if (cancelled) return;
        setStats(nextStats);
        const insights = await getCachedOrFreshInsights(nextStats);
        if (!cancelled) {
          setMessages((current) =>
            current.length
              ? current
              : [{ id: makeId(), role: "assistant", text: `Auto-insights for today:\n${insights}`, timestamp: Date.now() }]
          );
          setBooting(false);
        }
      };
      run().catch(() => {
        if (!cancelled) {
          addAssistantMessage("AI is unavailable. Check your connection or API key.");
          setBooting(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [addAssistantMessage, user])
  );

  const send = useCallback(async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || loading || !stats) return;
    setMessages((current) => [...current, { id: makeId(), role: "user", text, timestamp: Date.now() }]);
    setInput("");
    setLoading(true);
    const answer = await askGemini(text, stats);
    setMessages((current) => [...current, { id: makeId(), role: "assistant", text: answer, timestamp: Date.now() }]);
    setLoading(false);
  }, [input, loading, stats]);

  const canSend = useMemo(() => input.trim().length > 0 && !loading && !!stats, [input, loading, stats]);

  return (
    <LinearGradient colors={Gradients.screenBg} style={styles.root}>
      <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.safe}>
          <View style={styles.header}>
            <Pressable style={styles.iconButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>AI Business Advisor</Text>
              <Text style={styles.subtitle}>Powered by Gemini</Text>
            </View>
            <Pressable style={styles.clearButton} onPress={() => setMessages([])}>
              <Text style={styles.clearText}>Clear chat</Text>
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promptRow}>
            {QUICK_PROMPTS.map((prompt) => (
              <Pressable key={prompt} style={styles.promptChip} onPress={() => send(prompt)}>
                <Text style={styles.promptText}>{prompt}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <ScrollView style={styles.chat} contentContainerStyle={styles.chatContent} keyboardShouldPersistTaps="handled">
            {messages.map((message) => {
              const isUser = message.role === "user";
              return (
                <View key={message.id} style={[styles.messageBlock, isUser ? styles.messageBlockUser : styles.messageBlockAi]}>
                  {!isUser ? <Ionicons name="sparkles-outline" size={17} color={Colors.accent} style={styles.robotIcon} /> : null}
                  <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
                    <Text style={[styles.messageText, isUser ? styles.userText : styles.aiText]}>{message.text}</Text>
                  </View>
                  <Text style={styles.timestamp}>{formatTime(message.timestamp)}</Text>
                </View>
              );
            })}
            {(loading || booting) && (
              <View style={[styles.messageBlock, styles.messageBlockAi]}>
                <Ionicons name="sparkles-outline" size={17} color={Colors.accent} style={styles.robotIcon} />
                <View style={[styles.bubble, styles.aiBubble, styles.loadingBubble]}>
                  <ActivityIndicator color={Colors.primaryLight} />
                </View>
              </View>
            )}
          </ScrollView>

          <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask about dues, loans, or collections..."
              placeholderTextColor={Colors.textMuted}
              style={styles.input}
              multiline
            />
            <Pressable style={[styles.sendButton, !canSend && styles.sendButtonDisabled]} disabled={!canSend} onPress={() => send()}>
              <Ionicons name="paper-plane-outline" size={20} color={Colors.textPrimary} />
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
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  iconButton: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  headerCopy: { flex: 1 },
  title: { color: Colors.textPrimary, fontSize: 22, fontWeight: "800" },
  subtitle: { color: Colors.textSecondary, fontSize: 13, fontWeight: "600", marginTop: 2 },
  clearButton: { minHeight: 36, justifyContent: "center", paddingHorizontal: 10 },
  clearText: { color: Colors.textSecondary, fontSize: 12, fontWeight: "700" },
  promptRow: { gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  promptChip: { borderRadius: 999, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 9 },
  promptText: { color: Colors.textSecondary, fontSize: 12, fontWeight: "700" },
  chat: { flex: 1 },
  chatContent: { flexGrow: 1, padding: 16, gap: 12 },
  messageBlock: { maxWidth: "86%" },
  messageBlockUser: { alignSelf: "flex-end", alignItems: "flex-end" },
  messageBlockAi: { alignSelf: "flex-start", alignItems: "flex-start" },
  robotIcon: { marginLeft: 4, marginBottom: 4 },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11 },
  userBubble: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  aiBubble: { backgroundColor: Colors.bgCard, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: Colors.border },
  loadingBubble: { minWidth: 58, minHeight: 42, alignItems: "center", justifyContent: "center" },
  messageText: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  userText: { color: Colors.textPrimary },
  aiText: { color: Colors.textSecondary },
  timestamp: { color: Colors.textMuted, fontSize: 11, marginTop: 4, paddingHorizontal: 4 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 12, paddingTop: 10, backgroundColor: Colors.bgCard, borderTopWidth: 1, borderTopColor: Colors.border },
  input: { flex: 1, maxHeight: 112, minHeight: 44, borderRadius: 14, backgroundColor: Colors.bgCardAlt, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  sendButton: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: Colors.primary },
  sendButtonDisabled: { opacity: 0.5 },
});
