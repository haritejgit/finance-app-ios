import { Dimensions, PixelRatio } from "react-native";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const BASE_WIDTH = 390;

export const wp = (percent: number) => (SCREEN_W * percent) / 100;
export const hp = (percent: number) => (SCREEN_H * percent) / 100;
export const scale = (size: number) => (SCREEN_W / BASE_WIDTH) * size;
export const fontScale = (size: number) =>
  size * PixelRatio.getFontScale() > size * 1.3
    ? size * 1.3
    : size * PixelRatio.getFontScale();
