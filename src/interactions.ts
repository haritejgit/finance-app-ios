import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

export function lightImpact() {
  if (Platform.OS === "web") return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

