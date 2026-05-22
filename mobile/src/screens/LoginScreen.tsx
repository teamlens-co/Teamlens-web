import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { colors, borderRadius, spacing, shadow, typography } from '../theme';
import { API_BASE } from '../services/api';
import { MiniIcon } from '../components/IosKit';

export default function LoginScreen() {
  const { login, signup } = useAuth();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Email and password are required');
      return;
    }
    if (isSignup && (!fullName.trim() || !orgName.trim())) {
      Alert.alert('Error', 'Name and organization are required');
      return;
    }

    setLoading(true);
    const error = isSignup
      ? await signup(fullName.trim(), email.trim(), password, orgName.trim())
      : await login(email.trim(), password);
    setLoading(false);

    if (error) {
      Alert.alert('Error', error);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <View style={styles.dot} />
            <View style={[styles.dot, styles.dotMiddle]} />
            <View style={styles.dot} />
          </View>
          <Text style={styles.logoText}>TeamLens</Text>
        </View>

        <View style={styles.heroSection}>
          <Text style={styles.heroTitle}>
            {isSignup ? 'Create account' : 'Welcome back'}
          </Text>
          <Text style={styles.heroCopy}>
            {isSignup
              ? 'Start tracking workforce activity and gain insights for your team.'
              : 'Sign in to access your organization\'s dashboard and team analytics.'}
          </Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, !isSignup && styles.tabActive]}
              onPress={() => setIsSignup(false)}
            >
              <Text style={[styles.tabText, !isSignup && styles.tabTextActive]}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, isSignup && styles.tabActive]}
              onPress={() => setIsSignup(true)}
            >
              <Text style={[styles.tabText, isSignup && styles.tabTextActive]}>Register</Text>
            </TouchableOpacity>
          </View>

          {isSignup && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Full name</Text>
                <View style={styles.inputWrapper}>
                  <MiniIcon name="team" size={18} color={colors.muted} />
                  <TextInput
                    style={styles.input}
                    placeholder="John Doe"
                    placeholderTextColor={colors.mutedLight}
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                  />
                </View>
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Organization</Text>
                <View style={styles.inputWrapper}>
                  <MiniIcon name="grid" size={18} color={colors.muted} />
                  <TextInput
                    style={styles.input}
                    placeholder="Acme Corp"
                    placeholderTextColor={colors.mutedLight}
                    value={orgName}
                    onChangeText={setOrgName}
                    autoCapitalize="words"
                  />
                </View>
              </View>
            </>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email address</Text>
            <View style={styles.inputWrapper}>
              <MiniIcon name="bell" size={18} color={colors.muted} />
              <TextInput
                style={styles.input}
                placeholder="email@example.com"
                placeholderTextColor={colors.mutedLight}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <MiniIcon name="shield" size={18} color={colors.muted} />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={colors.mutedLight}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>{isSignup ? 'Create Workspace' : 'Sign In'}</Text>
            )}
          </TouchableOpacity>

          {!isSignup && (
            <TouchableOpacity style={styles.forgotPass}>
              <Text style={styles.forgotPassText}>Forgot password?</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.apiHint}>Connected to {API_BASE}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.xl,
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logoMark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand,
  },
  dotMiddle: {
    height: 14,
    borderRadius: 4,
  },
  logoText: {
    ...typography.h3,
    color: colors.brand,
    fontWeight: '600',
  },
  heroSection: {
    marginBottom: spacing.xl,
  },
  heroTitle: {
    ...typography.h1,
    marginBottom: spacing.sm,
  },
  heroCopy: {
    ...typography.body,
    color: colors.muted,
  },
  formCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadow.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface2,
    borderRadius: borderRadius.md,
    padding: 4,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  tabActive: {
    backgroundColor: colors.white,
    ...shadow.sm,
  },
  tabText: {
    ...typography.bodySm,
    fontWeight: '600',
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.text,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.label,
    marginBottom: spacing.xs,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    paddingHorizontal: spacing.sm,
    fontSize: 16,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.brand,
    borderRadius: borderRadius.full,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.md,
    ...shadow.md,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  forgotPass: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  forgotPassText: {
    ...typography.bodySm,
    color: colors.brand,
    fontWeight: '600',
  },
  footer: {
    marginTop: spacing.xxl,
    alignItems: 'center',
    paddingBottom: spacing.xl,
  },
  apiHint: {
    ...typography.small,
    color: colors.mutedLight,
  },
});
