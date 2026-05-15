import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import type { AttendanceEntry } from '../types';

export default function AttendanceScreen() {
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

    const result = await api.getAttendance(start, end);
    if (result.ok && result.data) {
      setEntries(result.data);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const statusColor = (status: string) => {
    switch (status) {
      case 'present': return '#22c55e';
      case 'late': return '#eab308';
      case 'half-day': return '#f97316';
      case 'absent': return '#ef4444';
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
      <Text style={styles.title}>Attendance</Text>
      {entries.length === 0 ? (
        <Text style={styles.empty}>No attendance data for this month</Text>
      ) : (
        entries.map((entry) => (
          <View key={entry.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.name}>{entry.fullName}</Text>
              <View style={[styles.badge, { backgroundColor: statusColor(entry.status) + '20' }]}>
                <View style={[styles.dot, { backgroundColor: statusColor(entry.status) }]} />
                <Text style={[styles.statusText, { color: statusColor(entry.status) }]}>
                  {entry.status.toUpperCase()}
                </Text>
              </View>
            </View>
            <View style={styles.cardBody}>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Date</Text>
                <Text style={styles.value}>{new Date(entry.date).toLocaleDateString()}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Clock In</Text>
                <Text style={styles.value}>{entry.clockIn ? new Date(entry.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Clock Out</Text>
                <Text style={styles.value}>{entry.clockOut ? new Date(entry.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Total Hours</Text>
                <Text style={styles.value}>{entry.totalHours.toFixed(1)}h</Text>
              </View>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', padding: 20, paddingTop: 60 },
  empty: { color: '#666', textAlign: 'center', marginTop: 40, fontSize: 16 },
  card: {
    backgroundColor: '#1a1a1a', borderRadius: 12, marginHorizontal: 16, marginBottom: 12, padding: 16,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  name: { fontSize: 16, fontWeight: '600', color: '#fff' },
  badge: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusText: { fontSize: 11, fontWeight: '600' },
  cardBody: {},
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: '#222',
  },
  label: { fontSize: 14, color: '#888' },
  value: { fontSize: 14, color: '#ddd' },
});
