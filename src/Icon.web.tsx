import React from "react";
import { StyleSheet } from "react-native";
import { iconPaths, type SvgNode } from "./icon-paths";

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: any;
}

function renderSvgNode(node: SvgNode, key: number) {
  if (node.tag === "text") {
    return React.createElement(
      "text" as any,
      {
        key,
        x: node.x,
        y: node.y,
        fill: "currentColor",
        fontFamily: "Arial, sans-serif",
        fontSize: node.fontSize,
        fontWeight: node.fontWeight,
        textAnchor: "middle",
      },
      node.value
    );
  }
  return React.createElement(node.tag as any, { key, ...node });
}

export default function Icon({ name, size = 24, color = "#000", style }: IconProps) {
  const flattenedStyle = StyleSheet.flatten(style) || {};
  const nodes = iconPaths[name] || iconPaths.warning;
  return React.createElement(
    "svg" as any,
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      color,
      style: {
        display: "inline-block",
        flexShrink: 0,
        verticalAlign: "middle",
        ...flattenedStyle,
      },
      "aria-hidden": true,
      focusable: false,
    },
    nodes.map(renderSvgNode)
  );
}
