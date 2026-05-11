import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/auth-context";
import { colors, gradient } from "../src/theme";

export default function SettingsScreen() {
  const { user, logout } = useAuth();

  return (
    <LinearGradient colors={[...gradient]} style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={colors.white} />
          </Pressable>

          <View style={styles.header}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={28} color={colors.white} />
            </View>
            <Text style={styles.title}>Settings</Text>
            <Text style={styles.subtitle}>Account and session details</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="mail-outline" size={18} color={colors.blue2} />
              </View>
              <View style={styles.infoCopy}>
                <Text style={styles.label}>Signed in as</Text>
                <Text style={styles.value}>{user?.email || "Unknown user"}</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="id-card-outline" size={18} color={colors.teal} />
              </View>
              <View style={styles.infoCopy}>
                <Text style={styles.label}>Display name</Text>
                <Text style={styles.value}>{user?.displayName || "User"}</Text>
              </View>
            </View>

            <Pressable
              style={styles.logoutBtn}
              onPress={async () => {
                await logout();
                router.replace("/login");
              }}
            >
              <Ionicons name="log-out-outline" size={18} color={colors.white} />
              <Text style={styles.logoutText}>Logout</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const screenWidth = Dimensions.get("window").width;

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  content: { flex: 1, width: "100%", maxWidth: Math.min(screenWidth - 32, 390), alignSelf: "center", padding: 16, justifyContent: "center", gap: 18 },
  backBtn: { position: "absolute", top: 16, left: 16, width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.24)" },
  header: { alignItems: "center", gap: 8 },
  avatar: { width: 64, height: 64, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.28)" },
  title: { fontSize: 28, fontWeight: "800", color: colors.white },
  subtitle: { color: "rgba(255,255,255,0.78)", fontSize: 14 },
  card: { backgroundColor: colors.white, borderRadius: 20, padding: 18, gap: 14, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 6 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  infoIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.sky },
  infoCopy: { flex: 1 },
  label: { color: colors.gray, fontWeight: "800", fontSize: 11, textTransform: "uppercase" },
  value: { color: colors.ink, fontWeight: "800", fontSize: 15, marginTop: 2 },
  logoutBtn: { marginTop: 8, borderRadius: 14, backgroundColor: colors.coral, padding: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  logoutText: { color: colors.white, fontWeight: "800", fontSize: 15 },
});
