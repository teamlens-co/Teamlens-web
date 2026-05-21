import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import api from '../services/api';
import { colors, borderRadius, spacing, shadow, typography } from '../theme';
import { AppCard, ScreenShell, MiniIcon } from '../components/IosKit';
import type { ActivityEntry } from '../types';

type ActivityTimelineApi = {
  employees?: Array<{
    userId: string;
    employeeName: string;
    topApps?: Array<{ name: string; seconds: number }>;
    segments?: Array<{
      start: string;
      end: string;
      kind: string;
      mouseMoves?: number;
      keyPresses?: number;
    }>;
  }>;
};

const normalizeActivities = (payload: unknown): ActivityEntry[] => {
  if (Array.isArray(payload)) {
    return payload as ActivityEntry[];
  }

  const timeline = payload as ActivityTimelineApi | null | undefined;
  const employees = timeline?.employees;
  if (!Array.isArray(employees)) {
    return [];
  }

  return employees.flatMap((employee) => {
    const appFallback = employee.topApps?.[0]?.name || 'Tracked activity';
    const segments = Array.isArray(employee.segments) ? employee.segments : [];

    return segments.map((segment, index) => {
      const startTime = new Date(segment.start).getTime();
      const endTime = new Date(segment.end).getTime();
      const duration = Number.isFinite(startTime) && Number.isFinite(endTime)
        ? Math.max(0, Math.round((endTime - startTime) / 1000))
        : 0;

      return {
        id: `${employee.userId}-${segment.start}-${index}`,
        timestamp: segment.start,
        type: segment.kind === 'active' ? 'productive' : 'neutral',
        application: appFallback,
        title: employee.employeeName,
        duration,
      };
    });
  });
};

export default function ActivitiesScreen() {
  const navigation = useNavigation<any>();
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
    const end = now.toISOString();
    const result = await api.getActivityTimeline(start, end);
    if (result.ok) {
      setActivities(normalizeActivities(result.data));
    } else {
      setActivities([]);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const typeInitial = (type: string) => {
    switch (type) {
      case 'productive': return 'P';
      case 'unproductive': return 'U';
      default: return 'N';
    }
  };

  const typeTone = (type: string) => {
    switch (type) {
      case 'productive': return { bg: colors.successTint, text: colors.success };
      case 'unproductive': return { bg: colors.dangerTint, text: colors.danger };
      default: return { bg: colors.brandLight, text: colors.brandDark };
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
    <ScreenShell>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={colors.brand} />}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MiniIcon name="back" size={24} color={colors.brand} />
          <Text style={styles.backText}>Home</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Live View</Text>
        <Text style={styles.subtitle}>Recent activity and focus signals</Text>

        {activities.length === 0 ? (
          <AppCard style={styles.emptyCard}>
            <MiniIcon name="play" size={40} color={colors.mutedLight} />
            <Text style={styles.emptyText}>No recent activity data available.</Text>
          </AppCard>
        ) : (
          activities.map((activity, i) => {
            const tone = typeTone(activity.type);
            return (
              <AppCard key={activity.id || i} style={styles.activityCard}>
                <View style={styles.row}>
                  <View style={[styles.iconBadge, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.icon, { color: tone.text }]}>{typeInitial(activity.type)}</Text>
                  </View>
                  <View style={styles.info}>
                    <Text style={styles.app}>{activity.application || 'Unknown App'}</Text>
                    <Text style={styles.employeeName} numberOfLines={1}>{activity.title}</Text>
                    <View style={styles.metaRow}>
                      <MiniIcon name="clock" size={10} color={colors.mutedLight} />
                      <Text style={styles.time}>
                        {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {activity.duration}s
                      </Text>
                    </View>
                  </View>
                </View>
              </AppCard>
            );
          })
        )}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  content: { paddingBottom: spacing.xxl },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.lg, marginLeft: -4 },
  backText: { ...typography.body, color: colors.brand, fontWeight: '600' },
  title: { ...typography.h1, marginBottom: 4 },
  subtitle: { ...typography.bodySm, color: colors.muted, marginBottom: spacing.lg },
  emptyCard: { alignItems: 'center', padding: spacing.xxl, gap: spacing.md, backgroundColor: colors.surface2 },
  emptyText: { ...typography.bodySm, color: colors.muted, textAlign: 'center' },
  activityCard: {
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  iconBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  icon: { fontSize: 14, fontWeight: '800' },
  info: { flex: 1 },
  app: { ...typography.bodySm, fontWeight: '700', color: colors.text },
  employeeName: { ...typography.caption, color: colors.muted, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  time: { fontSize: 11, color: colors.mutedLight },
});
