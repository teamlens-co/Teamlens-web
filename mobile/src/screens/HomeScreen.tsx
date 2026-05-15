import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
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

    if (analyticsResult.ok && analyticsResult.data) {
      setAnalytics(analyticsResult.data);
    }
    if (calendarResult.ok && calendarResult.data) {
      setCalendar(calendarResult.data);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const formatHours = (minutes?: number) => {
    if (!minutes) return '0h 0m';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h}h ${m}m`;
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4f46e5" />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>Hello, {user?.fullName?.split(' ')[0] || 'User'}</Text>
        <Text style={styles.orgName}>{user?.organization?.name || ''}</Text>
      </View>

      {/* Stats Cards */}
      <View style={styles.cardsRow}>
        <View style={[styles.card, { backgroundColor: '#1e1b4b' }]}>
          <Text style={styles.cardLabel}>Active Time</Text>
          <Text style={styles.cardValue}>{formatHours(analytics?.totalActiveMinutes)}</Text>
          <Text style={styles.cardSub}>
            {analytics?.activePercentage?.toFixed(1) || '0'}% productive
          </Text>
        </View>
        <View style={[styles.card, { backgroundColor: '#1c1917' }]}>
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
        <View style={[styles.card, { backgroundColor: '#0f172a' }]}>
          <Text style={styles.cardLabel}>Sessions</Text>
          <Text style={styles.cardValue}>{analytics?.sessionCount || 0}</Text>
          <Text style={styles.cardSub}>this period</Text>
        </View>
        <View style={[styles.card, { backgroundColor: '#0a1628' }]}>
          <Text style={styles.cardLabel}>Daily Avg</Text>
          <Text style={styles.cardValue}>{formatHours(analytics?.dailyAverage ? analytics.dailyAverage * 60 : 0)}</Text>
          <Text style={styles.cardSub}>per day</Text>
        </View>
      </View>

      {/* Calendar (7-day mini) */}
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
                    ? '#4f46e5'
                    : day.activeMinutes > 60
                    ? '#312e81'
                    : day.activeMinutes > 0
                    ? '#1e1b4b'
                    : '#1a1a1a',
                },
              ]}
            />
          ))}
        </View>
      </View>

      {/* Activity Summary */}
      {analytics?.dayData && analytics.dayData.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Breakdown</Text>
          {analytics.dayData.slice(0, 7).map((day, i) => (
            <View key={i} style={styles.dayRow}>
              <Text style={styles.dayName}>
                {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
              <View style={styles.dayBarContainer}>
                <View
                  style={[
                    styles.dayBar,
                    { width: `${Math.min((day.activeMinutes / 480) * 100, 100)}%` },
                  ]}
                />
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
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  },
  header: {
    padding: 20,
    paddingTop: 60,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  orgName: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  cardsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 12,
  },
  card: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
  },
  cardLabel: {
    fontSize: 12,
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cardValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginTop: 4,
  },
  cardSub: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  calendarCell: {
    width: (screenWidth - 56) / 7,
    aspectRatio: 1,
    borderRadius: 4,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dayName: {
    width: 120,
    fontSize: 12,
    color: '#aaa',
  },
  dayBarContainer: {
    flex: 1,
    height: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    overflow: 'hidden',
    marginHorizontal: 8,
  },
  dayBar: {
    height: '100%',
    backgroundColor: '#4f46e5',
    borderRadius: 10,
  },
  dayHours: {
    width: 60,
    fontSize: 12,
    color: '#888',
    textAlign: 'right',
  },
});
