import { Redirect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../src/auth-context";
import Icon from "../src/Icon";
import { getGradient } from "../src/theme";
import { useTheme } from "../src/theme-context";

export default function Index() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();
  if (loading) {
    return (
      <LinearGradient colors={[...getGradient(colors)]} style={styles.root}>
        <View style={styles.loaderCard}>
          <View style={styles.logo}>
            <Icon name="wallet-outline" size={30} color={colors.white} />
          </View>
          <Text style={styles.title}>Finance Manager</Text>
          <ActivityIndicator color={colors.white} />
        </View>
      </LinearGradient>
    );
  }
  return <Redirect href={user ? "/shift-selection" : "/login"} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "center", alignItems: "center" },
  loaderCard: { alignItems: "center", gap: 14 },
  logo: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "#FFFFFF", fontSize: 24, fontWeight: "800" },
});
