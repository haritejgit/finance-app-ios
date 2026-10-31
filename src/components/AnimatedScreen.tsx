import React, { useEffect, useRef } from "react";
import { Animated, ViewProps } from "react-native";
import { useReducedMotion } from "../useReducedMotion";

type Props = ViewProps & {
  children: React.ReactNode;
  delay?: number;
};

export function AnimatedScreen({ children, delay = 0, style, ...props }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      fadeAnim.setValue(1);
      slideAnim.setValue(0);
      return;
    }

    const animation = Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        delay,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [delay, fadeAnim, reduceMotion, slideAnim]);

  return (
    <Animated.View
      style={[{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }, style]}
      {...props}
    >
      {children}
    </Animated.View>
  );
}
