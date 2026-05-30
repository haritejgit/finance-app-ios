import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "../theme-context";

export function CustomerIdBadge({ numericalId, id }: { numericalId?: number; id?: string }) {
  const colors = useColors();
  const badgeLabel = Number.isInteger(numericalId)
    ? String(numericalId).padStart(2, "0")
    : String(id ?? "0").slice(0, 2).padStart(2, "0");

  return (
    <View style={[styles.badge, { borderColor: colors.ink }]}>
      <Text style={[styles.text, { color: colors.ink }]}>{badgeLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: "transparent",
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontSize: 20,
    fontWeight: "bold",
  },
});
