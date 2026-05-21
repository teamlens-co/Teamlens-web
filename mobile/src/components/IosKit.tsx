import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, borderRadius, shadow, typography, spacing } from '../theme';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

export function ScreenShell({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <SafeAreaView style={[styles.shell, style]}>
      <View style={styles.innerShell}>
        {children}
      </View>
    </SafeAreaView>
  );
}

export function AppCard({ children, style, noPadding = false }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; noPadding?: boolean }) {
  return <View style={[styles.card, !noPadding && styles.cardPadding, style]}>{children}</View>;
}

export function Avatar({ name, size = 48, online = false }: { name: string; size?: number; online?: boolean }) {
  const initials = name.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2) || 'U';
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: Math.max(13, size * 0.32) }]}>{initials}</Text>
      {online ? <View style={[styles.onlineDot, { width: size * 0.28, height: size * 0.28, borderRadius: size * 0.14, right: 0, bottom: 0 }]} /> : null}
    </View>
  );
}

export function MiniIcon({ name, color = colors.brand, size = 20 }: { name: string; color?: string; size?: number }) {
  const iconMap: Record<string, any> = {
    grid: { lib: Ionicons, name: 'grid-outline' },
    team: { lib: Ionicons, name: 'people-outline' },
    brain: { lib: MaterialCommunityIcons, name: 'brain' },
    bell: { lib: Ionicons, name: 'notifications-outline' },
    settings: { lib: Ionicons, name: 'settings-outline' },
    eye: { lib: Ionicons, name: 'eye-outline' },
    clock: { lib: Ionicons, name: 'time-outline' },
    target: { lib: Ionicons, name: 'analytics-outline' },
    camera: { lib: Ionicons, name: 'camera-outline' },
    phone: { lib: Ionicons, name: 'call-outline' },
    play: { lib: Ionicons, name: 'play-outline' },
    folder: { lib: Ionicons, name: 'folder-outline' },
    bars: { lib: Ionicons, name: 'bar-chart-outline' },
    warn: { lib: Ionicons, name: 'warning-outline' },
    shield: { lib: Ionicons, name: 'shield-checkmark-outline' },
    search: { lib: Ionicons, name: 'search-outline' },
    back: { lib: Ionicons, name: 'chevron-back' },
    forward: { lib: Ionicons, name: 'chevron-forward' },
    'help-circle': { lib: Ionicons, name: 'help-circle-outline' },
    'card-text': { lib: MaterialCommunityIcons, name: 'card-text-outline' },
  };

  const icon = iconMap[name] || { lib: Ionicons, name: 'help-outline' };
  const IconLib = icon.lib;

  return <IconLib name={icon.name} size={size} color={color} />;
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  innerShell: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'android' ? spacing.xl : 0,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    ...shadow.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPadding: {
    padding: spacing.md,
  },
  avatar: {
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarText: { color: colors.text, fontWeight: '700' },
  onlineDot: {
    position: 'absolute',
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.white,
  },
  textIcon: { ...typography.h3 },
});
