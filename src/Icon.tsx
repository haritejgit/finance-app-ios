import React from 'react';
import { Ionicons } from '@expo/vector-icons';

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: any;
}

export default function Icon({ name, size = 24, color = '#000', style }: IconProps) {
  return <Ionicons name={name as any} size={size} color={color} style={style} />;
}
