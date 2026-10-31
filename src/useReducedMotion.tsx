import React, { createContext, useContext, useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

const ReducedMotionContext = createContext(false);

/** Subscribe once at the app root so animated list rows do not add native listeners. */
export function ReducedMotionProvider({ children }: { children: React.ReactNode }) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => {
        // Keep motion enabled if the platform does not expose this preference.
      });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return (
    <ReducedMotionContext.Provider value={reduceMotion}>
      {children}
    </ReducedMotionContext.Provider>
  );
}

/** Read the platform accessibility preference for reduced motion. */
export function useReducedMotion() {
  return useContext(ReducedMotionContext);
}
