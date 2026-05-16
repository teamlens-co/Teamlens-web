import React from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { colors, borderRadius } from '../theme';

export default function SettingsScreen() {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={[styles.avatar, { backgroundColor: colors.brandLight }]}>
          <Text style={styles.avatarText}>
            {user?.fullName?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{user?.fullName || 'User'}</Text>
          <Text style={styles.profileEmail}>{user?.email || ''}</Text>
          <Text style={styles.profileOrg}>{user?.organization?.name || ''}</Text>
        </View>
      </View>

      {/* Account Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuText}>Profile</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuText}>Notifications</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Preferences */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuText}>Theme</Text>
          <Text style={styles.menuValue}>Light</Text>
        </TouchableOpacity>
      </View>

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.menuItem}>
          <Text style={styles.menuText}>Version</Text>
          <Text style={styles.menuValue}>1.0.0</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, padding: 20, paddingTop: 60 },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: borderRadius.lg,
    marginHorizontal: 16, padding: 16, marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarText: { fontSize: 20, fontWeight: '700', color: colors.brandDark },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '600', color: colors.text },
  profileEmail: { fontSize: 14, color: colors.muted, marginTop: 2 },
  profileOrg: { fontSize: 13, color: colors.mutedLight, marginTop: 2 },
  section: { marginBottom: 24, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 12, color: colors.mutedLight, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  menuItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: borderRadius.md, padding: 16, marginBottom: 4,
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  menuText: { fontSize: 15, color: colors.text },
  menuValue: { fontSize: 14, color: colors.muted },
  menuArrow: { fontSize: 20, color: colors.mutedLight },
  logoutButton: {
    marginHorizontal: 16, marginTop: 8, marginBottom: 40,
    backgroundColor: colors.white, borderRadius: borderRadius.md, padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: '#FFCDD2',
  },
  logoutText: { fontSize: 16, fontWeight: '600', color: colors.danger },
});
