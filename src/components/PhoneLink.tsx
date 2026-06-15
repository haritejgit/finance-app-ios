import React from "react";
import { Linking, Pressable, StyleSheet, Text } from "react-native";
import Icon from "../Icon";
import { formatWhatsAppLink } from "../statement-format";

type PhoneLinkProps = {
  number?: string | null;
  textStyle?: any;
};

export function PhoneLink({ number, textStyle }: PhoneLinkProps) {
  const waUrl = formatWhatsAppLink(number);
  const label = number || "—";

  if (!waUrl) {
    return <Text style={textStyle}>{label}</Text>;
  }

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open WhatsApp chat with ${label}`}
      onPress={(event) => {
        event.stopPropagation?.();
        Linking.openURL(waUrl).catch(() => undefined);
      }}
      style={styles.link}
    >
      <Icon name="logo-whatsapp" size={14} color="#0F6E56" />
      <Text style={[styles.text, textStyle]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#E1F5EE",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  text: {
    color: "#0F6E56",
    fontWeight: "600",
    textDecorationLine: "none",
  },
});
