import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import type { ActivityEntry } from '../types';

export default function ActivitiesScreen() {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
    const end = now.toISOString();

    const result = await api.getActivityTimeline(start, end);
    if (result.ok && result.data) {
      setActivities(result.data);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const typeIcon = (type: string) => {
    switch (type) {
      case 'productive': return '✅';
      case 'unproductive': return '❌';
      default: return '➖';
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
      <Text style={styles.title}>Activity Timeline</Text>
      {activities.length === 0 ? (
        <Text style={styles.empty}>No activity data for the past 7 days</Text>
      ) : (
        activities.map((activity, i) => (
          <View key={activity.id || i} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.icon}>{typeIcon(activity.type)}</Text>
              <View style={styles.content}>
                <Text style={styles.app}>{activity.application || 'Unknown App'}</Text>
                <Text style={styles.titleText} numberOfLines={1}>{activity.title}</Text>
                <Text style={styles.time}>
                  {new Date(activity.timestamp).toLocaleString()} · {activity.duration}s
                </Text>
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
    backgroundColor: '#1a1a1a', borderRadius: 12, marginHorizontal: 16, marginBottom: 8, padding: 14,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  icon: { fontSize: 18, marginRight: 12, marginTop: 2 },
  content: { flex: 1 },
  app: { fontSize: 13, fontWeight: '600', color: '#fff' },
  titleText: { fontSize: 13, color: '#aaa', marginTop: 2 },
  time: { fontSize: 11, color: '#666', marginTop: 4 },
});
