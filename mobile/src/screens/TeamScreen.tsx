import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import type { TeamMember, User } from '../types';

export default function TeamScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const result = await api.getUsers();
    if (result.ok && result.data) {
      setUsers(result.data);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const roleColor = (role: string) => {
    switch (role) {
      case 'MANAGER': return '#4f46e5';
      case 'EMPLOYEE': return '#22c55e';
      default: return '#888';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor="#4f46e5" />}
    >
      <Text style={styles.title}>Team</Text>
      <Text style={styles.count}>{users.length} member{users.length !== 1 ? 's' : ''}</Text>
      {users.length === 0 ? (
        <Text style={styles.empty}>No team members found</Text>
      ) : (
        users.map((user) => (
          <TouchableOpacity key={user.id} style={styles.card}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.name}>{user.fullName}</Text>
              <Text style={styles.email}>{user.email}</Text>
            </View>
            <View style={[styles.roleBadge, { backgroundColor: roleColor(user.role) + '20' }]}>
              <Text style={[styles.roleText, { color: roleColor(user.role) }]}>
                {user.role}
              </Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', padding: 20, paddingTop: 60 },
  count: { fontSize: 14, color: '#888', marginTop: -12, paddingHorizontal: 20, marginBottom: 12 },
  empty: { color: '#666', textAlign: 'center', marginTop: 40, fontSize: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: '#fff' },
  email: { fontSize: 13, color: '#888', marginTop: 2 },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  roleText: { fontSize: 11, fontWeight: '600' },
});
