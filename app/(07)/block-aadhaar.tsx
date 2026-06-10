import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import Icon from "../../src/Icon";
import { blockAadhaar, getBlockedAadhaars, unblockAadhaar } from "../../src/repository";
import { getGradient } from "../../src/theme";
import { useTheme } from "../../src/theme-context";
import { BlockedAadhaar } from "../../src/types";

function digitsOnly(value: string) {
  return value.replace(/\D/g, "").slice(0, 12);
}

function formatAadhaar(value: string) {
  return digitsOnly(value).replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function maskAadhaar(value: string) {
  const digits = digitsOnly(value);
  return digits.length >= 4 ? `XXXX XXXX ${digits.slice(-4)}` : "XXXX XXXX ----";
}

function getBlockedDigits(item: BlockedAadhaar) {
  return item.aadhaarNumber || item.aadhaar || "";
}

function toDate(value: unknown) {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value && typeof (value as { seconds?: number }).seconds === "number") {
    return new Date((value as { seconds: number }).seconds * 1000);
  }
  return null;
}

export default function BlockAadhaarScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<"new" | "list">("new");
  const [aadhaar, setAadhaar] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState<BlockedAadhaar[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadBlocked = useCallback(async () => {
    if (!user) {
      setBlocked([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setBlocked(await getBlockedAadhaars(user.uid));
    } catch {
      Alert.alert("Unable to load", "Blocked Aadhaar records could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadBlocked();
    }, [loadBlocked])
  );

  const canSubmit = useMemo(() => digitsOnly(aadhaar).length === 12 && !saving, [aadhaar, saving]);

  const confirmBlock = useCallback(() => {
    const normalized = digitsOnly(aadhaar);
    if (normalized.length !== 12) {
      setError("Enter a valid 12-digit Aadhaar number.");
      return;
    }
    if (!user) return;

    const performBlock = async () => {
      try {
        setSaving(true);
        await blockAadhaar(normalized, reason.trim(), user.uid);
        setAadhaar("");
        setReason("");
        setError("");
        await loadBlocked();
        setActiveTab("list");
        if (Platform.OS === "web") {
          alert("This Aadhaar number has been blocked.");
        } else {
          Alert.alert("Blocked", "This Aadhaar number has been blocked.");
        }
      } catch (saveError) {
        if (Platform.OS === "web") {
          alert(saveError instanceof Error ? saveError.message : "Please try again.");
        } else {
          Alert.alert("Block failed", saveError instanceof Error ? saveError.message : "Please try again.");
        }
      } finally {
        setSaving(false);
      }
    };

    if (Platform.OS === "web") {
      const confirm = window.confirm(`Block ${formatAadhaar(normalized)} from registration?`);
      if (confirm) {
        performBlock();
      }
    } else {
      Alert.alert("Block Aadhaar", `Block ${formatAadhaar(normalized)} from registration?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: performBlock,
        },
      ]);
    }
  }, [aadhaar, loadBlocked, reason, user]);

  const confirmUnblock = useCallback((item: BlockedAadhaar) => {
    const performUnblock = async () => {
      try {
        await unblockAadhaar(item.id);
        await loadBlocked();
      } catch (err) {
        if (Platform.OS === "web") {
          alert(err instanceof Error ? err.message : "Failed to unblock.");
        } else {
          Alert.alert("Error", err instanceof Error ? err.message : "Failed to unblock.");
        }
      }
    };

    if (Platform.OS === "web") {
      const confirm = window.confirm(`Allow ${maskAadhaar(getBlockedDigits(item))} again?`);
      if (confirm) {
        performUnblock();
      }
    } else {
      Alert.alert("Unblock Aadhaar", `Allow ${maskAadhaar(getBlockedDigits(item))} again?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          style: "destructive",
          onPress: performUnblock,
        },
      ]);
    }
  }, [loadBlocked]);

  return (
    <AnimatedScreen style={styles.root}>
      <LinearGradient colors={[...getGradient(colors)]} style={styles.root}>
        <SafeAreaView style={styles.safe}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.safe}>
            <View style={styles.container}>
              <View style={styles.header}>
                <Pressable accessibilityLabel="Go back" style={styles.backBtn} onPress={() => router.back()}>
                  <Icon name="arrow-back" size={20} color={colors.white} />
                </Pressable>
                <View style={styles.headerCopy}>
                  <Text style={styles.title}>Block Aadhaar</Text>
                  <Text style={styles.subtitle}>Prevent blocked IDs from new registrations.</Text>
                </View>
              </View>

              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.tabs, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
                  {[
                    { key: "new" as const, label: "Block New Aadhaar" },
                    { key: "list" as const, label: "Blocked List" },
                  ].map((tab) => {
                    const active = activeTab === tab.key;
                    return (
                      <Pressable
                        key={tab.key}
                        accessibilityLabel={tab.label}
                        style={[styles.tab, active && { backgroundColor: "#6C63FF" }]}
                        onPress={() => setActiveTab(tab.key)}
                      >
                        <Text style={[styles.tabText, { color: active ? colors.white : colors.textSecondary }]}>{tab.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {activeTab === "new" ? (
                  <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    <Text style={[styles.label, { color: colors.text }]}>Aadhaar number</Text>
                    <TextInput
                      accessibilityLabel="Aadhaar number"
                      value={formatAadhaar(aadhaar)}
                      onChangeText={(value) => {
                        setAadhaar(digitsOnly(value));
                        setError("");
                      }}
                      placeholder="XXXX XXXX XXXX"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numeric"
                      maxLength={14}
                      style={[styles.input, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
                    />
                    {!!error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}

                    <Text style={[styles.label, { color: colors.text }]}>Reason</Text>
                    <TextInput
                      accessibilityLabel="Reason for blocking"
                      value={reason}
                      onChangeText={setReason}
                      placeholder="Fraudulent activity, duplicate identity..."
                      placeholderTextColor={colors.textMuted}
                      style={[styles.input, styles.reasonInput, { backgroundColor: colors.surfaceTint, borderColor: colors.border, color: colors.text }]}
                      multiline
                    />

                    <Pressable
                      accessibilityLabel="Block Aadhaar"
                      style={[styles.blockBtn, (!canSubmit || saving) && styles.disabled]}
                      disabled={!canSubmit || saving}
                      onPress={confirmBlock}
                    >
                      {saving ? <ActivityIndicator color={colors.white} /> : <Icon name="lock-closed-outline" size={18} color={colors.white} />}
                      <Text style={styles.blockBtnText}>{saving ? "Blocking..." : "Block Aadhaar"}</Text>
                    </Pressable>
                  </ScrollView>
                ) : loading ? (
                  <View style={styles.loading}>
                    <ActivityIndicator color="#6C63FF" />
                    <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading blocked list...</Text>
                  </View>
                ) : (
                  <FlatList
                    data={blocked}
                    keyExtractor={(item) => item.id}
                    removeClippedSubviews
                    maxToRenderPerBatch={10}
                    windowSize={5}
                    initialNumToRender={8}
                    getItemLayout={(_, index) => ({ length: 88, offset: 88 * index, index })}
                    ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSecondary }]}>No Aadhaar numbers are blocked yet.</Text>}
                    renderItem={({ item, index }) => {
                      const blockedAt = toDate(item.blockedAt || item.blocked_at);
                      return (
                        <AnimatedListItem index={index}>
                          <View style={[styles.blockedRow, { borderColor: colors.border, backgroundColor: colors.surfaceTint }]}>
                            <View style={styles.blockedCopy}>
                              <Text style={[styles.blockedAadhaar, { color: colors.text }]}>{maskAadhaar(getBlockedDigits(item))}</Text>
                              <Text style={[styles.blockedReason, { color: colors.textSecondary }]} numberOfLines={2}>
                                {item.reason || "No reason provided"}{blockedAt ? ` • ${blockedAt.toLocaleDateString()}` : ""}
                              </Text>
                            </View>
                            <Pressable
                              accessibilityLabel={`Unblock ${maskAadhaar(getBlockedDigits(item))}`}
                              style={[styles.unblockBtn, { backgroundColor: colors.destructiveSoft }]}
                              onPress={() => confirmUnblock(item)}
                            >
                              <Icon name="trash-outline" size={16} color={colors.error} />
                              <Text style={[styles.unblockText, { color: colors.error }]}>Unblock</Text>
                            </Pressable>
                          </View>
                        </AnimatedListItem>
                      );
                    }}
                  />
                )}
              </View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>
    </AnimatedScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  container: { flex: 1, width: "100%", maxWidth: 720, alignSelf: "center", padding: 20, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.16)", borderWidth: 1, borderColor: "rgba(255,255,255,0.24)" },
  headerCopy: { flex: 1 },
  title: { color: "#FFFFFF", fontSize: 28, fontWeight: "900" },
  subtitle: { color: "rgba(255,255,255,0.78)", fontSize: 13, fontWeight: "700", marginTop: 2 },
  card: { flex: 1, borderWidth: 1, borderRadius: 16, padding: 16, gap: 16, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 18, elevation: 6 },
  tabs: { flexDirection: "row", borderWidth: 1, borderRadius: 14, padding: 4, gap: 4 },
  tab: { flex: 1, minHeight: 44, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  tabText: { fontSize: 12, fontWeight: "900", textAlign: "center" },
  form: { gap: 10 },
  label: { fontSize: 13, fontWeight: "900" },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  reasonInput: { minHeight: 92, textAlignVertical: "top" },
  error: { fontSize: 12, fontWeight: "800" },
  blockBtn: { minHeight: 50, borderRadius: 14, backgroundColor: "#DC2626", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 8 },
  blockBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  disabled: { opacity: 0.55 },
  loading: { paddingVertical: 52, alignItems: "center", gap: 10 },
  loadingText: { fontWeight: "800" },
  empty: { textAlign: "center", paddingVertical: 52, fontWeight: "800" },
  blockedRow: { minHeight: 78, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  blockedCopy: { flex: 1 },
  blockedAadhaar: { fontSize: 16, fontWeight: "900" },
  blockedReason: { fontSize: 12, fontWeight: "700", lineHeight: 17, marginTop: 3 },
  unblockBtn: { minHeight: 44, borderRadius: 13, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  unblockText: { fontSize: 11, fontWeight: "900" },
});
