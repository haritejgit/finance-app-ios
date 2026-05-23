import React, { useEffect, useMemo, useRef } from "react";
import { Animated, ViewProps } from "react-native";

type Props = ViewProps & {
  children: React.ReactNode;
  index?: number;
};

export function AnimatedListItem({ children, index = 0, style, ...props }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;
  const delay = useMemo(() => Math.min(index * 50, 300), [index]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 240,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 240,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, opacity, translateY]);

  return (
    <Animated.View
      style={[{ opacity, transform: [{ translateY }] }, style]}
      {...props}
    >
      {children}
    </Animated.View>
  );
}
