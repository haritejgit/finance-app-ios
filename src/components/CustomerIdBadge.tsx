import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import { formatCustomerId } from "../validation";

export function CustomerIdBadge({ numericalId, id }: { numericalId?: number; id?: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{formatCustomerId(numericalId, id)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 48,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "#93C5FD",
  },
  text: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "900",
  },
});

