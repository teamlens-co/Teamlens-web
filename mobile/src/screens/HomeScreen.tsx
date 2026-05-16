import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { colors, borderRadius } from '../theme';
import type { DashboardAnalytics, CalendarDay } from '../types';

const screenWidth = Dimensions.get('window').width;

export default function HomeScreen() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

    const [analyticsResult, calendarResult] = await Promise.all([
      api.getDashboardAnalytics(startOfMonth, endOfMonth),
      api.getCalendarHeatmap(now.getFullYear(), now.getMonth() + 1),
    ]);

    if (analyticsResult.ok && analyticsResult.data) setAnalytics(analyticsResult.data);
    if (calendarResult.ok && calendarResult.data) setCalendar(calendarResult.data);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const formatHours = (minutes?: number) => {
    if (!minutes) return '0h 0m';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h}h ${m}m`;
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>Hello, {user?.fullName?.split(' ')[0] || 'User'}</Text>
        <Text style={styles.orgName}>{user?.organization?.name || ''}</Text>
      </View>

      {/* Stats Cards */}
      <View style={styles.cardsRow}>
        <View style={[styles.card, { backgroundColor: colors.brandLight }]}>
          <Text style={styles.cardLabel}>Active Time</Text>
          <Text style={styles.cardValue}>{formatHours(analytics?.totalActiveMinutes)}</Text>
          <Text style={styles.cardSub}>
            {analytics?.activePercentage?.toFixed(1) || '0'}% productive
          </Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={styles.cardLabel}>Idle Time</Text>
          <Text style={styles.cardValue}>{formatHours(analytics?.totalIdleMinutes)}</Text>
          <Text style={styles.cardSub}>
            {analytics?.totalIdleMinutes && analytics.totalActiveMinutes
              ? ((analytics.totalIdleMinutes / (analytics.totalActiveMinutes + analytics.totalIdleMinutes)) * 100).toFixed(1)
              : '0'}% idle
          </Text>
        </View>
      </View>

      <View style={styles.cardsRow}>
        <View style={[styles.card, { backgroundColor: colors.white }]}>
          <Text style={styles.cardLabel}>Sessions</Text>
          <Text style={styles.cardValue}>{analytics?.sessionCount || 0}</Text>
          <Text style={styles.cardSub}>this period</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.white }]}>
          <Text style={styles.cardLabel}>Daily Avg</Text>
          <Text style={styles.cardValue}>{formatHours(analytics?.dailyAverage ? analytics.dailyAverage * 60 : 0)}</Text>
          <Text style={styles.cardSub}>per day</Text>
        </View>
      </View>

      {/* Calendar Heatmap */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>This Month</Text>
        <View style={styles.calendarGrid}>
          {calendar.slice(0, 28).map((day, i) => (
            <View
              key={i}
              style={[
                styles.calendarCell,
                {
                  backgroundColor: day.activeMinutes > 120
                    ? colors.brand
                    : day.activeMinutes > 60
                    ? '#D4A853'
                    : day.activeMinutes > 0
                    ? colors.brandLight
                    : '#F0EDEA',
                },
              ]}
            />
          ))}
        </View>
      </View>

      {/* Daily Breakdown */}
      {analytics?.dayData && analytics.dayData.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Breakdown</Text>
          {analytics.dayData.slice(0, 7).map((day, i) => (
            <View key={i} style={styles.dayRow}>
              <Text style={styles.dayName}>
                {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
              <View style={styles.dayBarContainer}>
                <View style={[styles.dayBar, { width: `${Math.min((day.activeMinutes / 480) * 100, 100)}%` }]} />
              </View>
              <Text style={styles.dayHours}>{formatHours(day.activeMinutes)}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  header: { padding: 20, paddingTop: 60 },
  greeting: { fontSize: 28, fontWeight: '700', color: colors.text },
  orgName: { fontSize: 14, color: colors.muted, marginTop: 4 },
  cardsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginBottom: 12 },
  card: {
    flex: 1, borderRadius: borderRadius.lg, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardLabel: { fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  cardValue: { fontSize: 28, fontWeight: '700', color: colors.text, marginTop: 4 },
  cardSub: { fontSize: 12, color: colors.muted, marginTop: 4 },
  section: { padding: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 12 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  calendarCell: {
    width: (screenWidth - 56) / 7, aspectRatio: 1, borderRadius: 4,
  },
  dayRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  dayName: { width: 120, fontSize: 12, color: colors.muted },
  dayBarContainer: {
    flex: 1, height: 20, backgroundColor: '#F0EDEA', borderRadius: 10,
    overflow: 'hidden', marginHorizontal: 8,
  },
  dayBar: { height: '100%', backgroundColor: colors.brand, borderRadius: 10 },
  dayHours: { width: 60, fontSize: 12, color: colors.muted, textAlign: 'right' },
});
