import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ClockScreen } from "@/screens/ClockScreen";
import { LoginScreen } from "@/screens/LoginScreen";
import { theme } from "@/theme";

// Importing the tracker registers the background location task. This must
// happen at module scope so the task exists before the OS tries to wake it.
import "@/tracking/tracker";

function Root() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={theme.color.primary} />
      </View>
    );
  }

  return token ? <ClockScreen /> : <LoginScreen />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.color.bg,
  },
});
