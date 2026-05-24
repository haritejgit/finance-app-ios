import React from "react";
import { StyleSheet, Text, View } from "react-native";

export function CustomerIdBadge({ numericalId, id }: { numericalId?: number; id?: string }) {
  const badgeLabel = Number.isInteger(numericalId)
    ? String(numericalId).padStart(2, "0")
    : String(id ?? "0").slice(0, 2).padStart(2, "0");

  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{badgeLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: "#1B4332",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
});
