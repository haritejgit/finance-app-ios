import Clipboard from "@react-native-clipboard/clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth-context";
import { AnimatedListItem } from "../../src/components/AnimatedListItem";
import { AnimatedScreen } from "../../src/components/AnimatedScreen";
import { getDashboardAnalytics } from "../../src/finance-analytics";
import Icon from "../../src/Icon";
import { useTheme } from "../../src/theme-context";
import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

const generateAnthropic = httpsCallable<{
  messages: { role: "user" | "assistant"; content: string }[];
  context?: unknown;
}, { text: string }>(getFunctions(getApp(), "us-central1"), "generateAnthropic");
const aiProxyEnabled = process.env.EXPO_PUBLIC_AI_PROXY_ENABLED === "true";

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function TypingDots() {
  const dot = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dot, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0, duration: 420, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [dot]);

  return (
    <View style={styles.dots}>
      {[0, 1, 2].map((index) => (
        <Animated.View
          key={index}
          style={[
            styles.dot,
            {
              opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.35 + index * 0.15, 1] }),
              transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -3 - index] }) }],
            },
          ]}
        />
      ))}
    </View>
  );
}

export default function AIScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const statusPulse = useRef(new Animated.Value(0.45)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(statusPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(statusPulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [statusPulse]);

  const listData = useMemo(() => [...messages].reverse(), [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || !user || !aiProxyEnabled) return;

    const userMessage: ChatMessage = { id: makeId(), role: "user", text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const context = user ? await getDashboardAnalytics(user.uid) : null;
      const response = await generateAnthropic({
        context: {
          totals: context?.totals,
          recentTransactions: context?.recentTransactions?.slice(0, 5).map(({ amountPaid, paymentDate, paymentMode, paymentType }) => ({ amountPaid, paymentDate, paymentMode, paymentType })),
          dueAlerts: context?.dueAlerts?.slice(0, 5).map(({ balanceAmount, weeklyAmount, dueAmount, dueCount, lastDueDate }) => ({ balanceAmount, weeklyAmount, dueAmount, dueCount, lastDueDate })),
        },
        messages: nextMessages.slice(-20).map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: message.text,
        })),
      });
      setMessages((current) => [...current, { id: makeId(), role: "assistant", text: response.data.text || "I could not generate a response. Please try again." }]);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      const message = code === "functions/failed-precondition"
        ? "AI is not configured yet. Ask the account owner to configure the Anthropic server API key."
        : code === "functions/resource-exhausted"
          ? "AI request limit reached. Try again shortly."
          : "I could not reach the finance assistant right now. Please check your connection and try again.";
      setMessages((current) => [...current, { id: makeId(), role: "assistant", text: message }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, user]);

  const clearChat = useCallback(() => {
    if (!messages.length) return;
    if (Platform.OS === "web") {
      const confirm = window.confirm("Remove all messages from this chat?");
      if (confirm) setMessages([]);
    } else {
      Alert.alert("Clear chat", "Remove all messages from this chat?", [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: () => setMessages([]) },
      ]);
    }
  }, [messages.length]);

  return (
    <AnimatedScreen style={styles.root}>
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <LinearGradient colors={["#12294A", "#1E3A63"]} style={styles.header}>
            <Pressable accessibilityLabel="Go back" style={styles.headerBtn} onPress={() => router.back()}>
              <Icon name="arrow-back" size={20} color="#FFFFFF" />
            </Pressable>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>Finance AI Assistant 🤖</Text>
              <View style={styles.statusRow}>
                <Animated.View style={[styles.statusDot, { opacity: statusPulse }]} />
                <Text style={styles.statusText}>{aiProxyEnabled ? "Ready" : "Setup needed"}</Text>
              </View>
            </View>
            <Pressable accessibilityLabel="Clear chat" style={styles.headerBtn} onPress={clearChat}>
              <Icon name="trash-outline" size={18} color="#FFFFFF" />
            </Pressable>
          </LinearGradient>

          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyArt}>🤖💬</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{aiProxyEnabled ? "Ask me anything about your finances!" : "AI setup is pending"}</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                {aiProxyEnabled ? "Collections, dues, loan status, and route priorities." : "Ask the account owner to enable the secure AI service."}
              </Text>
            </View>
          ) : (
            <FlatList
              inverted
              data={listData}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.chatList}
              removeClippedSubviews
              maxToRenderPerBatch={10}
              windowSize={5}
              initialNumToRender={8}
              renderItem={({ item, index }) => {
                const isUser = item.role === "user";
                return (
                  <AnimatedListItem index={index}>
                    <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
                      {!isUser && <Text style={styles.avatar}>🤖</Text>}
                      <Pressable
                        accessibilityLabel="Copy message"
                        onLongPress={() => Clipboard.setString(item.text)}
                        style={[
                          styles.bubble,
                          isUser
                            ? styles.userBubble
                            : { backgroundColor: colors.card, borderColor: colors.border },
                        ]}
                      >
                        <Text style={[styles.messageText, { color: isUser ? "#FFFFFF" : colors.text }]}>{item.text}</Text>
                        <Pressable accessibilityLabel="Copy message" style={styles.copyBtn} onPress={() => Clipboard.setString(item.text)}>
                          <Text style={[styles.copyText, { color: isUser ? "rgba(255,255,255,0.78)" : colors.textMuted }]}>Copy</Text>
                        </Pressable>
                      </Pressable>
                    </View>
                  </AnimatedListItem>
                );
              }}
            />
          )}

          {loading && (
            <View style={styles.typingWrap}>
              <Text style={styles.avatar}>🤖</Text>
              <View style={[styles.typingBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TypingDots />
              </View>
            </View>
          )}

          <View style={[styles.inputBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              accessibilityLabel="Ask finance assistant"
              value={input}
              onChangeText={setInput}
              placeholder="Ask about collections, dues, or customers..."
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text }]}
              editable={aiProxyEnabled && !!user}
              multiline
            />
            <Pressable
              accessibilityLabel="Send message"
              style={[styles.sendBtn, (!input.trim() || loading || !user || !aiProxyEnabled) && styles.sendBtnDisabled]}
              disabled={!input.trim() || loading || !user || !aiProxyEnabled}
              onPress={sendMessage}
            >
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.sendText}>Send</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </AnimatedScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { minHeight: 92, paddingHorizontal: 16, paddingVertical: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  headerBtn: { width: 44, height: 44, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  headerTitleWrap: { flex: 1 },
  headerTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E" },
  statusText: { color: "rgba(255,255,255,0.82)", fontSize: 12, fontWeight: "800" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  emptyArt: { fontSize: 56, marginBottom: 10 },
  emptyTitle: { fontSize: 19, fontWeight: "900", textAlign: "center" },
  emptySub: { fontSize: 13, fontWeight: "700", textAlign: "center", marginTop: 6, lineHeight: 19 },
  chatList: { padding: 16, gap: 10 },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 10, justifyContent: "flex-start" },
  messageRowUser: { justifyContent: "flex-end" },
  avatar: { fontSize: 22 },
  bubble: { maxWidth: "82%", borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11 },
  userBubble: { backgroundColor: "#12294A", borderColor: "#12294A" },
  messageText: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  copyBtn: { alignSelf: "flex-end", marginTop: 6, minHeight: 24, justifyContent: "center" },
  copyText: { fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  typingWrap: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  typingBubble: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 11 },
  dots: { flexDirection: "row", gap: 5, height: 14, alignItems: "center" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#12294A" },
  inputBar: { margin: 12, borderWidth: 1, borderRadius: 24, padding: 8, flexDirection: "row", alignItems: "flex-end", gap: 8, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  input: { flex: 1, minHeight: 42, maxHeight: 108, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  sendBtn: { minWidth: 72, minHeight: 44, borderRadius: 22, backgroundColor: "#12294A", alignItems: "center", justifyContent: "center", shadowColor: "#12294A", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 4 },
  sendBtnDisabled: { opacity: 0.55 },
  sendText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
});
