import { Platform } from "react-native";
import Toast from "react-native-toast-message";

export function showToast(type: "success" | "error" | "info", text1: string, text2?: string) {
  if (Platform.OS === "web") {
    Toast.show({ type, text1, text2, position: "bottom", visibilityTime: 2800 });
    return;
  }
  Toast.show({ type, text1, text2, position: "bottom", visibilityTime: 2600 });
}

