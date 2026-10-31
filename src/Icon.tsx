import React from "react";
import Ionicons from "@expo/vector-icons/Ionicons";

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: any;
}

/** Native icon implementation; the web implementation uses inline SVG paths. */
export default function Icon({ name, size = 24, color = "#000", style }: IconProps) {
  return <Ionicons name={name as any} size={size} color={color} style={style} />;
}
