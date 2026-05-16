import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { colors, borderRadius } from '../theme';
import type { User } from '../types';

export default function TeamScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const result = await api.getUsers();
    if (result.ok && result.data) setUsers(result.data);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const roleColor = (role: string) => {
    switch (role) {
      case 'MANAGER': return colors.brand;
      case 'EMPLOYEE': return colors.success;
      default: return colors.muted;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={colors.brand} />}
    >
      <Text style={styles.title}>Team</Text>
      <Text style={styles.count}>{users.length} member{users.length !== 1 ? 's' : ''}</Text>
      {users.length === 0 ? (
        <Text style={styles.empty}>No team members found</Text>
      ) : (
        users.map((user) => (
          <TouchableOpacity key={user.id} style={styles.card}>
            <View style={[styles.avatar, { backgroundColor: user.role === 'MANAGER' ? colors.brandLight : '#E8F5E9' }]}>
              <Text style={[styles.avatarText, { color: user.role === 'MANAGER' ? colors.brandDark : colors.success }]}>
                {user.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.name}>{user.fullName}</Text>
              <Text style={styles.email}>{user.email}</Text>
            </View>
            <View style={[styles.roleBadge, { backgroundColor: roleColor(user.role) + '18' }]}>
              <Text style={[styles.roleText, { color: roleColor(user.role) }]}>
                {user.role === 'MANAGER' ? 'Admin' : 'Member'}
              </Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, padding: 20, paddingTop: 60 },
  count: { fontSize: 14, color: colors.muted, marginTop: -12, paddingHorizontal: 20, marginBottom: 12 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 40, fontSize: 16 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: borderRadius.md,
    marginHorizontal: 16, marginBottom: 8, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 14, fontWeight: '700' },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  email: { fontSize: 13, color: colors.muted, marginTop: 2 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  roleText: { fontSize: 11, fontWeight: '600' },
});
