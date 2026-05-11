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
};

export default function Icon({ name, size = 24, color = '#000', fallback, style }: IconProps) {
  // On web, if Ionicons fails to load, show fallback text
  if (Platform.OS === 'web') {
    try {
      return <Ionicons name={name as any} size={size} color={color} style={style} />;
    } catch (error) {
      // Fallback to text emoji or custom text
      const fallbackText = fallback || fallbackTexts[name] || '?';
      return (
        <Text style={[
          {
            fontSize: size,
            color: color,
            textAlign: 'center',
            lineHeight: size,
          },
          style
        ]}>
          {fallbackText}
        </Text>
      );
    }
  }
  
  // On native platforms, use Ionicons normally
  return <Ionicons name={name as any} size={size} color={color} style={style} />;
}
