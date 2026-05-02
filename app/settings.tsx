import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../src/auth-context";
import { colors } from "../src/theme";

export default function SettingsScreen() {
  const { user, logout } = useAuth();

  return (
    <LinearGradient colors={[colors.blue1, colors.blue2]} style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.value}>{user?.email || "Unknown user"}</Text>
        <Text style={styles.label}>Display name</Text>
        <Text style={styles.value}>{user?.displayName || "User"}</Text>

        <Pressable
          style={styles.logoutBtn}
          onPress={async () => {
            await logout();
            router.replace("/login");
          }}
        >
          <Text style={styles.logoutText}>LOGOUT</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 20, justifyContent: "center" },
  card: { backgroundColor: colors.white, borderRadius: 20, padding: 20, gap: 8 },
  title: { fontSize: 24, fontWeight: "700", color: "#1a1a1a", marginBottom: 8 },
  label: { color: "#6b7280", fontWeight: "600", fontSize: 12 },
  value: { color: "#111827", fontWeight: "600", fontSize: 16 },
  logoutBtn: { marginTop: 16, borderRadius: 12, backgroundColor: colors.blue2, padding: 14, alignItems: "center" },
  logoutText: { color: colors.white, fontWeight: "700" },
});
