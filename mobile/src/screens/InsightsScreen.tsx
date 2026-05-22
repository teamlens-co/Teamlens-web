import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { colors, borderRadius, spacing, shadow, typography } from '../theme';
import { AppCard, ScreenShell, MiniIcon } from '../components/IosKit';
import type { UsageReportItem } from '../types';

const formatHours = (seconds: number) => {
  const hours = seconds / 3600;
  return hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round(seconds / 60)}m`;
};

const categoryColor = (category: string) => {
  const key = category.toUpperCase();
  if (key === 'PRODUCTIVE') return colors.success;
  if (key === 'UNPRODUCTIVE') return colors.danger;
  return colors.info;
};

export default function InsightsScreen() {
  const [items, setItems] = useState<UsageReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const result = await api.getUsageReport(start, now.toISOString());
    setItems(result.ok && Array.isArray(result.data?.items) ? result.data.items : []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const total = items.reduce((sum, item) => sum + item.durationSeconds, 0);
  const categories = ['PRODUCTIVE', 'NEUTRAL', 'UNPRODUCTIVE'].map((category) => ({
    category,
    seconds: items.filter((item) => item.category.toUpperCase() === category).reduce((sum, item) => sum + item.durationSeconds, 0),
  }));

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color={colors.brand} size="large" /></View>;
  }

  return (
    <ScreenShell>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={colors.brand} />}
      >
        <Text style={styles.title}>AI Center</Text>
        <Text style={styles.subtitle}>Smart productivity signals and trends</Text>

        <AppCard style={styles.chartCard}>
          <Text style={styles.cardTitle}>Activity Allocation</Text>
          <View style={styles.barStack}>
            {categories.map((item) => (
              <View
                key={item.category}
                style={[
                  styles.stackSegment,
                  {
                    flex: total ? Math.max(0.05, item.seconds / total) : 1,
                    backgroundColor: categoryColor(item.category),
                  },
                ]}
              />
            ))}
          </View>
          <View style={styles.legendContainer}>
            {categories.map((item) => (
              <View key={item.category} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: categoryColor(item.category) }]} />
                <View>
                  <Text style={styles.legendLabel}>{item.category.toLowerCase()}</Text>
                  <Text style={styles.legendValue}>{formatHours(item.seconds)}</Text>
                </View>
              </View>
            ))}
          </View>
        </AppCard>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>App Classification</Text>
          <TouchableOpacity><Text style={styles.linkText}>Recategorize</Text></TouchableOpacity>
        </View>

        <AppCard style={styles.listCard} noPadding>
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No activity data recorded yet.</Text>
            </View>
          ) : (
            items.slice(0, 10).map((item, index) => (
              <View key={index} style={[styles.itemRow, index === items.slice(0, 10).length - 1 && styles.lastRow]}>
                <View style={styles.itemIcon}>
                  <MiniIcon name="grid" size={16} color={colors.muted} />
                </View>
                <View style={styles.itemMain}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.appName || item.name || item.domain || 'Unknown'}
                  </Text>
                  <View style={styles.categoryRow}>
                    <View style={[styles.dot, { backgroundColor: categoryColor(item.category) }]} />
                    <Text style={styles.itemCategory}>{item.category.toLowerCase()}</Text>
                  </View>
                </View>
                <Text style={styles.itemTime}>{formatHours(item.durationSeconds)}</Text>
              </View>
            ))
          )}
        </AppCard>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  content: { paddingBottom: spacing.xxl },
  title: { ...typography.h1, marginBottom: 4 },
  subtitle: { ...typography.bodySm, color: colors.muted, marginBottom: spacing.lg },
  chartCard: { padding: spacing.lg, marginBottom: spacing.xl },
  cardTitle: { ...typography.h3, marginBottom: spacing.lg },
  barStack: { height: 12, borderRadius: 6, overflow: 'hidden', flexDirection: 'row', backgroundColor: colors.surface2, marginBottom: spacing.lg },
  stackSegment: { height: '100%' },
  legendContainer: { flexDirection: 'row', justifyContent: 'space-between' },
  legendItem: { flexDirection: 'row', gap: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  legendLabel: { ...typography.caption, textTransform: 'capitalize', fontWeight: '600' },
  legendValue: { ...typography.bodySm, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: { ...typography.h3 },
  linkText: { ...typography.bodySm, color: colors.brand, fontWeight: '600' },
  listCard: { overflow: 'hidden' },
  itemRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  lastRow: { borderBottomWidth: 0 },
  itemIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  itemMain: { flex: 1 },
  itemName: { ...typography.bodySm, fontWeight: '600', color: colors.text, marginBottom: 2 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  itemCategory: { ...typography.caption, textTransform: 'capitalize' },
  itemTime: { ...typography.bodySm, fontWeight: '600', color: colors.muted },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { ...typography.bodySm, color: colors.muted },
});
