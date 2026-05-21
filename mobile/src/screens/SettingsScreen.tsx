import React from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { colors, borderRadius, spacing, shadow, typography } from '../theme';
import { AppCard, Avatar, ScreenShell, MiniIcon } from '../components/IosKit';

export default function SettingsScreen() {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScreenShell>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>

        <AppCard style={styles.profileCard}>
          <Avatar name={user?.fullName || 'User'} size={60} />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.fullName || 'User'}</Text>
            <Text style={styles.profileEmail}>{user?.email || ''}</Text>
            <View style={styles.orgBadge}>
              <Text style={styles.orgBadgeText}>{user?.organization?.name || 'No Workspace'}</Text>
            </View>
          </View>
        </AppCard>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <MenuLink label="Profile Details" icon="team" />
          <MenuLink label="Notifications" icon="bell" />
          <MenuLink label="Security" icon="shield" />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <MenuLink label="Theme" icon="grid" value="Light" />
          <MenuLink label="Language" icon="help-circle" value="English" />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          <MenuLink label="Help Center" icon="help-circle" />
          <MenuLink label="About TeamLens" icon="brain" value="v1.0.0" />
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <MiniIcon name="back" size={18} color={colors.danger} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>TeamLens Mobile • Made with ❤️</Text>
      </ScrollView>
    </ScreenShell>
  );
}

function MenuLink({ label, icon, value }: any) {
  return (
    <TouchableOpacity style={styles.menuItem}>
      <View style={styles.menuLeft}>
        <View style={styles.menuIcon}>
          <MiniIcon name={icon} size={18} color={colors.muted} />
        </View>
        <Text style={styles.menuLabel}>{label}</Text>
      </View>
      <View style={styles.menuRight}>
        {value && <Text style={styles.menuValue}>{value}</Text>}
        <MiniIcon name="forward" size={16} color={colors.mutedLight} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
  },
  title: {
    ...typography.h1,
    marginBottom: spacing.lg,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  profileInfo: {
    flex: 1,
    marginLeft: spacing.lg,
  },
  profileName: {
    ...typography.h3,
  },
  profileEmail: {
    ...typography.caption,
    marginBottom: 6,
  },
  orgBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  orgBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.muted,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.label,
    marginBottom: spacing.sm,
    marginLeft: 4,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    ...typography.bodySm,
    fontWeight: '600',
  },
  menuRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuValue: {
    ...typography.bodySm,
    color: colors.muted,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.dangerTint,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  logoutText: {
    ...typography.body,
    color: colors.danger,
    fontWeight: '700',
  },
  footerText: {
    ...typography.small,
    textAlign: 'center',
    marginTop: spacing.xxl,
    opacity: 0.6,
  },
});
