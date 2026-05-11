import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, View, Platform } from 'react-native';

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  fallback?: string;
  style?: any;
}

// Fallback text mapping for common icons
const fallbackTexts: { [key: string]: string } = {
  'home-outline': '🏠',
  'cash-outline': '💰',
  'location': '📍',
  'checkmark': '✓',
  'close': '✗',
  'document-text-outline': '📄',
  'phone-portrait-outline': '📱',
  'arrow-up-outline': '↑',
  'wallet-outline': '💼',
  'trending-up-outline': '📈',
  'sunny-outline': '☀️',
  'moon-outline': '🌙',
  'person-outline': '👤',
  'call-outline': '📞',
  'card-outline': '🆔',
  'create-outline': '✏️',
  'trash-outline': '🗑️',
  'refresh-outline': '🔄',
  'arrow-forward': '→',
  'arrow-back': '←',
  'business-outline': '🏢',
  'add': '+',
  'people': '👥',
  'mail-outline': '✉️',
  'id-card-outline': '🆔',
  'log-out-outline': '🚪',
  'warning': '⚠️',
  'id-card': '🆔',
  'cash': '💰',
  'person': '👤',
  'call': '📞',
  'trash': '🗑️',
  'lock-closed-outline': '🔒',
  'logo-google': 'G',
  'trending-up': '📈',
  'trending-down': '📉',
  'analytics-outline': '📊',
  'settings-outline': '⚙️',
  'arrow-down': '↓',
  'wallet': '💼',
};

export default function Icon({ name, size = 24, color = '#000', fallback, style }: IconProps) {
  // On web, use text fallbacks directly to avoid empty boxes
  if (Platform.OS === 'web') {
    const fallbackText = fallback || fallbackTexts[name] || '?';
    return (
      <Text style={[
        {
          fontSize: size,
          color: color,
          textAlign: 'center',
          lineHeight: size,
          fontFamily: 'system-ui', // Use system font for better emoji support
        },
        style
      ]}>
        {fallbackText}
      </Text>
    );
  }
  
  // On native platforms, use Ionicons normally
  return <Ionicons name={name as any} size={size} color={color} style={style} />;
}
