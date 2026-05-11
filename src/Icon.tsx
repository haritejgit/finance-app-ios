import React from 'react';
import { Platform, StyleSheet } from 'react-native';

let Ionicons: any = null;
if (Platform.OS !== 'web') {
  Ionicons = require('@expo/vector-icons').Ionicons;
}

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: any;
}

type SvgNode =
  | { tag: 'path'; d: string; fill?: string; stroke?: string; strokeWidth?: number; strokeLinecap?: string; strokeLinejoin?: string }
  | { tag: 'circle'; cx: number; cy: number; r: number; fill?: string; stroke?: string; strokeWidth?: number }
  | { tag: 'text'; x: number; y: number; value: string; fontSize: number; fontWeight?: string };

const stroke = (d: string): SvgNode => ({
  tag: 'path',
  d,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

const iconPaths: Record<string, SvgNode[]> = {
  'add': [stroke('M12 5v14M5 12h14')],
  'analytics-outline': [
    stroke('M4 19V5'),
    stroke('M4 19h16'),
    stroke('M8 16v-5'),
    stroke('M12 16V8'),
    stroke('M16 16v-3'),
  ],
  'arrow-back': [stroke('M19 12H5'), stroke('M12 19l-7-7 7-7')],
  'arrow-down': [stroke('M12 5v14'), stroke('M5 12l7 7 7-7')],
  'arrow-forward': [stroke('M5 12h14'), stroke('M12 5l7 7-7 7')],
  'arrow-up-outline': [stroke('M12 19V5'), stroke('M5 12l7-7 7 7')],
  'business-outline': [
    stroke('M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16'),
    stroke('M16 9h2a2 2 0 0 1 2 2v10'),
    stroke('M3 21h18'),
    stroke('M8 7h4M8 11h4M8 15h4'),
  ],
  'call': [stroke('M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 3.08 5.18 2 2 0 0 1 5.06 3h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.63 2.61a2 2 0 0 1-.45 2.11L9 10.69a16 16 0 0 0 4.31 4.31l1.25-1.24a2 2 0 0 1 2.11-.45c.84.3 1.71.51 2.61.63A2 2 0 0 1 22 16.92z')],
  'call-outline': [stroke('M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 3.08 5.18 2 2 0 0 1 5.06 3h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.63 2.61a2 2 0 0 1-.45 2.11L9 10.69a16 16 0 0 0 4.31 4.31l1.25-1.24a2 2 0 0 1 2.11-.45c.84.3 1.71.51 2.61.63A2 2 0 0 1 22 16.92z')],
  'card-outline': [
    stroke('M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z'),
    stroke('M2 10h20'),
    stroke('M6 15h4'),
  ],
  'cash': [
    stroke('M3 7h18v10H3z'),
    stroke('M7 7a4 4 0 0 1-4 4M17 7a4 4 0 0 0 4 4M7 17a4 4 0 0 0-4-4M17 17a4 4 0 0 1 4-4'),
    { tag: 'circle', cx: 12, cy: 12, r: 2.5, fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
  ],
  'cash-outline': [
    stroke('M3 7h18v10H3z'),
    stroke('M7 7a4 4 0 0 1-4 4M17 7a4 4 0 0 0 4 4M7 17a4 4 0 0 0-4-4M17 17a4 4 0 0 1 4-4'),
    { tag: 'circle', cx: 12, cy: 12, r: 2.5, fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
  ],
  'checkmark': [stroke('M20 6 9 17l-5-5')],
  'close': [stroke('M18 6 6 18M6 6l12 12')],
  'create-outline': [stroke('M12 20h9'), stroke('M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z')],
  'document-text-outline': [stroke('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'), stroke('M14 2v6h6'), stroke('M8 13h8M8 17h6')],
  'home-outline': [stroke('M3 11 12 3l9 8'), stroke('M5 10v11h5v-6h4v6h5V10')],
  'id-card': [stroke('M3 5h18v14H3z'), { tag: 'circle', cx: 9, cy: 11, r: 2, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, stroke('M14 10h4M14 14h4M7 16h4')],
  'id-card-outline': [stroke('M3 5h18v14H3z'), { tag: 'circle', cx: 9, cy: 11, r: 2, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, stroke('M14 10h4M14 14h4M7 16h4')],
  'location': [stroke('M21 10c0 7-9 12-9 12S3 17 3 10a9 9 0 1 1 18 0z'), { tag: 'circle', cx: 12, cy: 10, r: 3, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }],
  'lock-closed-outline': [stroke('M6 10V8a6 6 0 0 1 12 0v2'), stroke('M5 10h14v11H5z'), stroke('M12 15v2')],
  'log-out-outline': [stroke('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'), stroke('M16 17l5-5-5-5'), stroke('M21 12H9')],
  'logo-google': [{ tag: 'text', x: 12, y: 17, value: 'G', fontSize: 16, fontWeight: '700' }],
  'mail-outline': [stroke('M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'), stroke('m22 6-10 7L2 6')],
  'moon-outline': [stroke('M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z')],
  'people': [stroke('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'), { tag: 'circle', cx: 9, cy: 7, r: 4, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, stroke('M23 21v-2a4 4 0 0 0-3-3.87'), stroke('M16 3.13a4 4 0 0 1 0 7.75')],
  'person': [{ tag: 'circle', cx: 12, cy: 8, r: 4, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, stroke('M4 22a8 8 0 0 1 16 0')],
  'person-outline': [{ tag: 'circle', cx: 12, cy: 8, r: 4, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, stroke('M4 22a8 8 0 0 1 16 0')],
  'phone-portrait-outline': [stroke('M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z'), stroke('M11 18h2')],
  'refresh': [stroke('M21 12a9 9 0 0 1-15.5 6.2L3 16'), stroke('M3 21v-5h5'), stroke('M3 12A9 9 0 0 1 18.5 5.8L21 8'), stroke('M21 3v5h-5')],
  'refresh-outline': [stroke('M21 12a9 9 0 0 1-15.5 6.2L3 16'), stroke('M3 21v-5h5'), stroke('M3 12A9 9 0 0 1 18.5 5.8L21 8'), stroke('M21 3v5h-5')],
  'search': [{ tag: 'circle', cx: 11, cy: 11, r: 7, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, stroke('M21 21l-4.3-4.3')],
  'settings-outline': [{ tag: 'circle', cx: 12, cy: 12, r: 3, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, stroke('M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2a2 2 0 1 1-4 0V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H2.8a2 2 0 1 1 0-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3h.1A1.7 1.7 0 0 0 10 3V2.8a2 2 0 1 1 4 0V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1A1.7 1.7 0 0 0 21 10h.2a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z')],
  'sunny-outline': [{ tag: 'circle', cx: 12, cy: 12, r: 4, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, stroke('M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4')],
  'trash': [stroke('M3 6h18'), stroke('M8 6V4h8v2'), stroke('M6 6l1 16h10l1-16'), stroke('M10 11v6M14 11v6')],
  'trash-outline': [stroke('M3 6h18'), stroke('M8 6V4h8v2'), stroke('M6 6l1 16h10l1-16'), stroke('M10 11v6M14 11v6')],
  'trending-down': [stroke('M23 18 13.5 8.5l-5 5L1 6'), stroke('M17 18h6v-6')],
  'trending-up': [stroke('M23 6 13.5 15.5l-5-5L1 18'), stroke('M17 6h6v6')],
  'trending-up-outline': [stroke('M23 6 13.5 15.5l-5-5L1 18'), stroke('M17 6h6v6')],
  'wallet': [stroke('M3 7h18v14H3z'), stroke('M3 7l3-4h12l3 4'), stroke('M16 14h4')],
  'wallet-outline': [stroke('M3 7h18v14H3z'), stroke('M3 7l3-4h12l3 4'), stroke('M16 14h4')],
  'warning': [stroke('M12 3 2 21h20L12 3z'), stroke('M12 9v5'), stroke('M12 18h.01')],
};

function renderSvgNode(node: SvgNode, key: number) {
  if (node.tag === 'text') {
    return React.createElement('text' as any, {
      key,
      x: node.x,
      y: node.y,
      fill: 'currentColor',
      fontFamily: 'Arial, sans-serif',
      fontSize: node.fontSize,
      fontWeight: node.fontWeight,
      textAnchor: 'middle',
    }, node.value);
  }

  return React.createElement(node.tag as any, { key, ...node });
}

function WebIcon({ name, size, color, style }: Required<IconProps>) {
  const flattenedStyle = StyleSheet.flatten(style) || {};
  const nodes = iconPaths[name] || iconPaths.warning;

  return React.createElement(
    'svg' as any,
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      color,
      style: {
        display: 'inline-block',
        flexShrink: 0,
        verticalAlign: 'middle',
        ...flattenedStyle,
      },
      'aria-hidden': true,
      focusable: false,
    },
    nodes.map(renderSvgNode)
  );
}

export default function Icon({ name, size = 24, color = '#000', style }: IconProps) {
  if (Platform.OS === 'web') {
    return <WebIcon name={name} size={size} color={color} style={style} />;
  }

  return <Ionicons name={name as any} size={size} color={color} style={style} />;
}
