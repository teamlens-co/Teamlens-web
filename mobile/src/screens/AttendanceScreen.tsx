import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { colors, borderRadius, shadow } from '../theme';
import type { AttendanceEntry } from '../types';

type AttendanceApiOverview = {
  timesheets?: Array<{
    id: string;
    userId: string;
    employeeName: string;
    date: string;
    clockInAt: string;
    clockOutAt: string | null;
    workSeconds: number;
    isCurrentlyWorking?: boolean;
  }>;
};

const normalizeAttendanceEntries = (payload: unknown): AttendanceEntry[] => {
  if (Array.isArray(payload)) {
    return payload as AttendanceEntry[];
  }

  const overview = payload as AttendanceApiOverview | null | undefined;
  const timesheets = overview?.timesheets;
  if (!Array.isArray(timesheets)) {
    return [];
  }

  return timesheets.map((item) => ({
    id: item.id,
    userId: item.userId,
    fullName: item.employeeName,
    date: item.date,
    clockIn: item.clockInAt,
    clockOut: item.clockOutAt,
    totalHours: item.workSeconds / 3600,
    status: item.isCurrentlyWorking ? 'present' : item.workSeconds > 0 ? 'present' : 'absent',
  }));
};

export default function AttendanceScreen() {
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
    const result = await api.getAttendance(start, end);
    if (result.ok) {
      setEntries(normalizeAttendanceEntries(result.data));
    } else {
      setEntries([]);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const statusColor = (status: string) => {
    switch (status) {
      case 'present': return colors.success;
      case 'late': return colors.warning;
      case 'half-day': return colors.warning;
      case 'absent': return colors.danger;
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
      <Text style={styles.title}>Attendance</Text>
      {entries.length === 0 ? (
        <Text style={styles.empty}>No attendance data for this month</Text>
      ) : (
        entries.map((entry) => (
          <View key={entry.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.name}>{entry.fullName}</Text>
              <View style={[styles.badge, { backgroundColor: statusColor(entry.status) + '18' }]}>
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
                <Text style={styles.label}>In</Text>
                <Text style={styles.value}>{entry.clockIn ? new Date(entry.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Out</Text>
                <Text style={styles.value}>{entry.clockOut ? new Date(entry.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</Text>
              </View>
              <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.label}>Hours</Text>
                <Text style={[styles.value, { fontWeight: '600' }]}>{entry.totalHours.toFixed(1)}h</Text>
              </View>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, padding: 20, paddingTop: 60 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 40, fontSize: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusText: { fontSize: 11, fontWeight: '600' },
  cardBody: {},
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider },
  label: { fontSize: 14, color: colors.muted },
  value: { fontSize: 14, color: colors.text },
});
