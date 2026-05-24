import { Redirect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../src/auth-context";
import { AnimatedScreen } from "../src/components/AnimatedScreen";
import Icon from "../src/Icon";
import { getGradient } from "../src/theme";
import { useTheme } from "../src/theme-context";

export default function Index() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();
  const intro = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, [intro]);

  useEffect(() => {
    if (!loading) {
      void SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [loading]);

  if (loading) {
    return (
      <AnimatedScreen style={styles.root}>
      <LinearGradient colors={[...getGradient(colors)]} style={styles.root}>
        <Animated.View
          style={[
            styles.loaderCard,
            {
              opacity: intro,
              transform: [
                { translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) },
                { scale: intro.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
              ],
            },
          ]}
        >
          <View style={styles.logo}>
            <Icon name="wallet-outline" size={30} color={colors.white} />
          </View>
          <Text style={styles.title}>Finance Manager</Text>
          <ActivityIndicator color={colors.white} />
        </Animated.View>
      </LinearGradient>
      </AnimatedScreen>
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
