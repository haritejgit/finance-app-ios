import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Icon from "./Icon";
import { colors } from "./theme";

type FinanceMotionProps = {
  compact?: boolean;
};

export default function FinanceMotion({ compact = false }: FinanceMotionProps) {
  const loop = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const rail = Animated.loop(
      Animated.timing(loop, {
        toValue: 1,
        duration: 4200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pop, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(pop, {
          toValue: 0,
          duration: 900,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ])
    );
    rail.start();
    pulse.start();
    return () => {
      rail.stop();
      pulse.stop();
    };
  }, [loop, pop]);

  const packets = useMemo(
    () => [
      { topRatio: 0.24, delay: 0, color: colors.teal, icon: "cash-outline" },
      { topRatio: 0.5, delay: 0.22, color: colors.coral, icon: "card-outline" },
      { topRatio: 0.76, delay: 0.46, color: "#7c3aed", icon: "phone-portrait-outline" },
    ],
    []
  );

  const pulseScale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1.08] });
  const pulseOpacity = pop.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const rotate = loop.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const counterRotate = loop.interpolate({ inputRange: [0, 1], outputRange: ["360deg", "0deg"] });

  return (
    <View pointerEvents="none" style={[styles.wrap, compact && styles.wrapCompact]}>
      <Animated.View style={[styles.orbit, { transform: [{ rotate }] }]}>
        <Animated.View style={[styles.orbitNode, styles.orbitNodeTop, { transform: [{ rotate: counterRotate }] }]}>
          <Icon name="cash-outline" size={compact ? 14 : 16} color={colors.teal} />
        </Animated.View>
        <Animated.View style={[styles.orbitNode, styles.orbitNodeRight, { transform: [{ rotate: counterRotate }] }]}>
          <Icon name="card-outline" size={compact ? 14 : 16} color={colors.coral} />
        </Animated.View>
        <Animated.View style={[styles.orbitNode, styles.orbitNodeBottom, { transform: [{ rotate: counterRotate }] }]}>
          <Icon name="phone-portrait-outline" size={compact ? 14 : 16} color="#7c3aed" />
        </Animated.View>
      </Animated.View>

      <Animated.View style={[styles.centerPulse, { opacity: pulseOpacity, transform: [{ scale: pulseScale }] }]}>
        <Icon name="wallet-outline" size={compact ? 20 : 26} color={colors.white} />
      </Animated.View>

      <View style={styles.railStack}>
        {packets.map((packet, index) => {
          const start = -36;
          const end = compact ? 238 : 286;
          const packetSize = index === 1 ? 34 : 30;
          const top = (compact ? 112 : 150) * packet.topRatio - packetSize / 2;
          const progress = loop.interpolate({
            inputRange: [0, packet.delay, Math.min(packet.delay + 0.52, 1), 1],
            outputRange: [start, start, end, end],
          });
          const opacity = loop.interpolate({
            inputRange: [0, packet.delay, Math.min(packet.delay + 0.08, 1), Math.min(packet.delay + 0.44, 1), Math.min(packet.delay + 0.52, 1), 1],
            outputRange: [0, 0, 1, 1, 0, 0],
          });
          return (
            <Animated.View
              key={packet.icon}
              style={[
                styles.packet,
                { top, backgroundColor: packet.color, opacity, transform: [{ translateX: progress }] },
                index === 1 && styles.packetMiddle,
              ]}
            >
              <Icon name={packet.icon as any} size={compact ? 12 : 14} color={colors.white} />
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 150,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  wrapCompact: {
    height: 112,
  },
  orbit: {
    position: "absolute",
    width: 126,
    height: 126,
    borderRadius: 63,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  orbitNode: {
    position: "absolute",
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 4,
  },
  orbitNodeTop: { top: -17, left: 46 },
  orbitNodeRight: { right: -17, top: 46 },
  orbitNodeBottom: { bottom: -17, left: 46 },
  centerPulse: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  railStack: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
  },
  packet: {
    position: "absolute",
    left: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  packetMiddle: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
});
