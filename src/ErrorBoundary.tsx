import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "./theme";

type State = { error: Error | null };

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Unhandled app error", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.root}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>The app hit an unexpected problem. You can retry without losing your saved data.</Text>
        <Pressable style={styles.button} onPress={() => this.setState({ error: null })}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.background },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", textAlign: "center", marginBottom: 8 },
  body: { color: colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: "center", marginBottom: 18 },
  button: { minHeight: 44, borderRadius: 12, backgroundColor: colors.primary, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "800" },
});

