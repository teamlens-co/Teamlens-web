import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { resolveBaseUrl } from "@/services/api";
import { theme } from "@/theme";

export function LoginScreen() {
  const { signIn, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length >= 8 && !submitting;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch {
      // The error is surfaced through context; keep the form filled in.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>TeamLens</Text>
        <Text style={styles.subtitle}>Sign in to clock in and track your shift.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Work email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            placeholder="you@company.com"
            placeholderTextColor={theme.color.muted}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            placeholder="At least 8 characters"
            placeholderTextColor={theme.color.muted}
            onSubmitEditing={onSubmit}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonLabel}>Sign in</Text>
          )}
        </Pressable>

        <Text style={styles.host}>Connecting to {resolveBaseUrl()}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.color.bg },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: theme.space(6),
    gap: theme.space(4),
  },
  title: { fontSize: 32, fontWeight: "700", color: theme.color.text },
  subtitle: {
    fontSize: 15,
    color: theme.color.muted,
    marginBottom: theme.space(4),
  },
  field: { gap: theme.space(2) },
  label: { fontSize: 13, fontWeight: "600", color: theme.color.muted },
  input: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(3.5),
    fontSize: 16,
    color: theme.color.text,
  },
  error: {
    color: theme.color.danger,
    backgroundColor: theme.color.dangerBg,
    padding: theme.space(3),
    borderRadius: theme.radius.sm,
    fontSize: 14,
  },
  button: {
    backgroundColor: theme.color.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space(4),
    alignItems: "center",
    marginTop: theme.space(2),
  },
  buttonDisabled: { opacity: 0.5 },
  buttonLabel: { color: "#fff", fontSize: 16, fontWeight: "600" },
  host: {
    textAlign: "center",
    fontSize: 12,
    color: theme.color.muted,
    marginTop: theme.space(4),
  },
});
