import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { AppCard, MiniIcon, ScreenShell } from '../components/IosKit';
import { borderRadius, colors, shadow, spacing, typography } from '../theme';
import type { Team, UsageBreakdownItem, UsageReport, UsageReportItem, User } from '../types';

type ReportTab = 'total' | 'employee' | 'team' | 'location';
type FilterChip = { id: string; label: string; type: 'all' | 'employee' | 'team' };

const tabs: Array<{ id: ReportTab; label: string }> = [
  { id: 'total', label: 'Total' },
  { id: 'employee', label: 'Employee' },
  { id: 'team', label: 'Team' },
  { id: 'location', label: 'Location' },
];

const chartColors = [colors.brand, colors.success, colors.warning, colors.info, '#6B5DD3', '#0F766E', '#9333EA', colors.muted];

const monthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: start.toISOString(), end: now.toISOString() };
};

const formatDuration = (seconds?: number) => {
  const total = Math.max(0, Math.round(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m`;
};

const categoryTone = (category?: string) => {
  const value = (category || '').toUpperCase();
  if (value === 'PRODUCTIVE') return colors.success;
  if (value === 'UNPRODUCTIVE') return colors.danger;
  return colors.info;
};

const resourceName = (item: UsageReportItem) => item.name || item.appName || item.domain || 'Unknown resource';

export default function ReportsScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [report, setReport] = useState<UsageReport>({ items: [], categories: [], breakdowns: [], groupBy: 'total' });
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTab, setActiveTab] = useState<ReportTab>('total');
  const [selectedFilter, setSelectedFilter] = useState<FilterChip>({ id: 'all', label: 'All employees', type: 'all' });
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const range = monthRange();
    const userId = selectedFilter.type === 'employee' ? selectedFilter.id : user?.role !== 'MANAGER' ? user?.id : undefined;
    const teamId = selectedFilter.type === 'team' ? selectedFilter.id : undefined;

    const [reportResult, usersResult, teamsResult] = await Promise.all([
      api.getUsageReport(range.start, range.end, userId, activeTab, teamId),
      api.getUsers(),
      api.getTeams(),
    ]);

    setReport(reportResult.ok && reportResult.data ? {
      items: Array.isArray(reportResult.data.items) ? reportResult.data.items : [],
      categories: Array.isArray(reportResult.data.categories) ? reportResult.data.categories : [],
      breakdowns: Array.isArray(reportResult.data.breakdowns) ? reportResult.data.breakdowns : [],
      groupBy: reportResult.data.groupBy || activeTab,
    } : { items: [], categories: [], breakdowns: [], groupBy: activeTab });

    setUsers(usersResult.ok && Array.isArray(usersResult.data) ? usersResult.data : []);
    setTeams(teamsResult.ok && Array.isArray(teamsResult.data) ? teamsResult.data : []);
    setError(reportResult.ok ? null : reportResult.message || 'Report data load nahi ho paya.');
    setLoading(false);
    setRefreshing(false);
  }, [activeTab, selectedFilter, user?.id, user?.role]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const filters = useMemo<FilterChip[]>(() => {
    const base: FilterChip[] = [{ id: 'all', label: user?.role === 'MANAGER' ? 'All employees' : 'My usage', type: 'all' }];
    if (user?.role !== 'MANAGER') return base;
    return [
      ...base,
      ...users.map((item) => ({ id: item.id, label: item.fullName, type: 'employee' as const })),
      ...teams.map((item) => ({ id: item.id, label: item.name, type: 'team' as const })),
    ];
  }, [teams, user?.role, users]);

  const selectedSet = useMemo(() => new Set(selectedNames), [selectedNames]);
  const activeItems = useMemo(
    () => (selectedNames.length === 0 ? report.items : report.items.filter((item) => selectedSet.has(resourceName(item)))),
    [report.items, selectedNames.length, selectedSet]
  );
  const activeNameSet = useMemo(() => new Set(activeItems.map(resourceName)), [activeItems]);
  const totalSeconds = activeItems.reduce((sum, item) => sum + (item.durationSeconds || 0), 0);

  const breakdownRows = useMemo(() => {
    const grouped = new Map<string, { label: string; sub: string; durationSeconds: number; samples: number }>();

    report.breakdowns.forEach((row) => {
      if (!activeNameSet.has(row.name)) return;
      const key = activeTab === 'employee'
        ? `${row.employeeName}|${row.teamName}`
        : activeTab === 'team'
          ? row.teamName
          : row.locationName;
      const label = activeTab === 'employee' ? row.employeeName : activeTab === 'team' ? row.teamName : row.locationName;
      const sub = activeTab === 'employee' ? row.teamName : activeTab === 'team' ? 'Team total' : 'Usage location';
      const current = grouped.get(key) ?? { label: label || 'Unknown', sub: sub || 'Unknown', durationSeconds: 0, samples: 0 };
      current.durationSeconds += row.durationSeconds || 0;
      current.samples += row.samples || 0;
      grouped.set(key, current);
    });

    return Array.from(grouped.values()).sort((a, b) => b.durationSeconds - a.durationSeconds);
  }, [activeNameSet, activeTab, report.breakdowns]);

  const toggleSelection = (item: UsageReportItem) => {
    const name = resourceName(item);
    setSelectedNames((current) => (current.includes(name) ? current.filter((value) => value !== name) : [...current, name]));
  };

  const onFilterPress = (filter: FilterChip) => {
    setSelectedFilter(filter);
    setSelectedNames([]);
    setLoading(true);
  };

  return (
    <ScreenShell>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MiniIcon name="back" color={colors.brand} size={22} />
          <Text style={styles.backText}>Dashboard</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Apps and Websites</Text>
        <Text style={styles.subtitle}>Same report flow as web dashboard, optimized for mobile.</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRail}>
          {filters.map((filter) => {
            const selected = selectedFilter.type === filter.type && selectedFilter.id === filter.id;
            return (
              <TouchableOpacity key={`${filter.type}-${filter.id}`} style={[styles.filterChip, selected && styles.filterChipActive]} onPress={() => onFilterPress(filter)}>
                <Text style={[styles.filterText, selected && styles.filterTextActive]} numberOfLines={1}>{filter.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.segment}>
          {tabs.map((tab) => (
            <TouchableOpacity key={tab.id} onPress={() => { setActiveTab(tab.id); setLoading(true); }} style={[styles.segmentButton, activeTab === tab.id && styles.segmentActive]}>
              <Text style={[styles.segmentText, activeTab === tab.id && styles.segmentTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <AppCard style={styles.summary}>
          <Text style={styles.summaryLabel}>Selected usage</Text>
          <Text style={styles.summaryValue}>{formatDuration(totalSeconds)}</Text>
          <Text style={styles.summaryCopy}>{selectedFilter.label} • {selectedNames.length === 0 ? 'all resources' : `${selectedNames.length} selected`}</Text>
        </AppCard>

        <CategoryStrip report={report} />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>All apps and websites</Text>
          {loading ? <ActivityIndicator color={colors.brand} /> : null}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={styles.loader} />
        ) : report.items.length === 0 ? (
          <AppCard style={styles.empty}><Text style={styles.emptyText}>No apps or websites found for this range.</Text></AppCard>
        ) : (
          <View style={styles.listGap}>
            {report.items.slice(0, 40).map((item, index) => (
              <ResourceRow
                key={`${resourceName(item)}-${index}`}
                item={item}
                total={report.items.reduce((sum, row) => sum + (row.durationSeconds || 0), 0)}
                selected={selectedNames.length === 0 || selectedSet.has(resourceName(item))}
                onPress={() => toggleSelection(item)}
              />
            ))}
          </View>
        )}

        {activeTab !== 'total' ? (
          <View style={styles.breakdownSection}>
            <Text style={styles.sectionTitle}>{activeTab === 'employee' ? 'Usage per employee' : activeTab === 'team' ? 'Usage per team' : 'Usage per location'}</Text>
            {breakdownRows.length === 0 ? (
              <AppCard style={styles.empty}><Text style={styles.emptyText}>No usage breakdown for this selection.</Text></AppCard>
            ) : (
              <View style={styles.listGap}>
                {breakdownRows.slice(0, 30).map((row) => (
                  <BreakdownRow key={`${row.label}-${row.sub}`} row={row} total={totalSeconds} />
                ))}
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>
    </ScreenShell>
  );
}

function CategoryStrip({ report }: { report: UsageReport }) {
  const total = report.categories.reduce((sum, item) => sum + (item.durationSeconds || 0), 0);

  if (report.categories.length === 0) return null;

  return (
    <AppCard style={styles.categoryCard}>
      <Text style={styles.categoryTitle}>Productivity mix</Text>
      <View style={styles.categoryTrack}>
        {report.categories.map((item, index) => (
          <View
            key={`${item.name}-${index}`}
            style={[
              styles.categoryFill,
              {
                flex: total > 0 ? Math.max(0.05, item.durationSeconds / total) : 1,
                backgroundColor: categoryTone(item.category),
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.categoryLegend}>
        {report.categories.map((item) => (
          <View key={item.name} style={styles.categoryItem}>
            <View style={[styles.categoryDot, { backgroundColor: categoryTone(item.category) }]} />
            <Text style={styles.categoryText}>{item.name.toLowerCase()} {formatDuration(item.durationSeconds)}</Text>
          </View>
        ))}
      </View>
    </AppCard>
  );
}

function ResourceRow({ item, total, selected, onPress }: { item: UsageReportItem; total: number; selected: boolean; onPress: () => void }) {
  const color = selected ? categoryTone(item.category) : colors.mutedLight;
  const percent = total > 0 ? Math.max(4, Math.round(((item.durationSeconds || 0) / total) * 100)) : 0;

  return (
    <TouchableOpacity style={[styles.resourceRow, selected && styles.resourceRowActive]} onPress={onPress} activeOpacity={0.78}>
      <View style={[styles.resourceIcon, { backgroundColor: `${color}18` }]}>
        <MiniIcon name={item.domain || item.targetType !== 'APP' ? 'globe' : 'document'} color={color} size={18} />
      </View>
      <View style={styles.resourceMain}>
        <View style={styles.resourceTop}>
          <Text style={styles.resourceTitle} numberOfLines={1}>{resourceName(item)}</Text>
          <Text style={styles.resourceTime}>{formatDuration(item.durationSeconds)}</Text>
        </View>
        <Text style={styles.resourceMeta}>{(item.category || 'NEUTRAL').toLowerCase()} • {item.samples || 0} samples</Text>
        <View style={styles.track}><View style={[styles.fill, { width: `${percent}%`, backgroundColor: color }]} /></View>
      </View>
    </TouchableOpacity>
  );
}

function BreakdownRow({ row, total }: { row: Pick<UsageBreakdownItem, 'durationSeconds' | 'samples'> & { label: string; sub: string }; total: number }) {
  const percent = total > 0 ? Math.max(4, Math.round(((row.durationSeconds || 0) / total) * 100)) : 0;

  return (
    <AppCard style={styles.breakdownCard}>
      <View style={styles.breakdownTop}>
        <View style={styles.breakdownAvatar}>
          <Text style={styles.breakdownInitials}>{row.label.slice(0, 2).toUpperCase()}</Text>
        </View>
        <View style={styles.breakdownMain}>
          <Text style={styles.breakdownTitle} numberOfLines={1}>{row.label || 'Unknown'}</Text>
          <Text style={styles.breakdownMeta}>{row.sub} • {row.samples || 0} samples</Text>
        </View>
        <Text style={styles.breakdownTime}>{formatDuration(row.durationSeconds)}</Text>
      </View>
      <View style={styles.track}><View style={[styles.fill, { width: `${percent}%`, backgroundColor: colors.brand }]} /></View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.md, marginLeft: -4 },
  backText: { ...typography.bodySm, color: colors.brand, fontWeight: '600' },
  title: { ...typography.h1, marginBottom: 4 },
  subtitle: { ...typography.bodySm, color: colors.muted, marginBottom: spacing.md },
  filterRail: { gap: spacing.sm, paddingBottom: spacing.md },
  filterChip: {
    maxWidth: 190,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  filterChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  filterTextActive: { color: colors.white },
  segment: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: borderRadius.md, padding: 4, marginBottom: spacing.md },
  segmentButton: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: borderRadius.sm },
  segmentActive: { backgroundColor: colors.white, ...shadow.sm },
  segmentText: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  segmentTextActive: { color: colors.text },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerTint,
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: 12,
    marginBottom: spacing.md,
  },
  summary: { padding: spacing.lg, backgroundColor: colors.brand, borderColor: colors.brand, marginBottom: spacing.md },
  summaryLabel: { color: 'rgba(255,255,255,0.75)', fontWeight: '600' },
  summaryValue: { color: colors.white, fontSize: 34, fontWeight: '600', marginVertical: 4 },
  summaryCopy: { color: 'rgba(255,255,255,0.78)', fontSize: 13 },
  categoryCard: { padding: spacing.md, marginBottom: spacing.lg },
  categoryTitle: { ...typography.bodySm, fontWeight: '600', marginBottom: spacing.sm },
  categoryTrack: { height: 10, flexDirection: 'row', overflow: 'hidden', borderRadius: borderRadius.full, backgroundColor: colors.divider },
  categoryFill: { height: 10 },
  categoryLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  categoryItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoryDot: { width: 8, height: 8, borderRadius: 4 },
  categoryText: { ...typography.caption, textTransform: 'capitalize' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionTitle: { ...typography.h3 },
  loader: { marginTop: spacing.xl },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { ...typography.bodySm, color: colors.muted, textAlign: 'center' },
  listGap: { gap: spacing.sm },
  resourceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...shadow.sm,
  },
  resourceRowActive: { borderColor: '#F4B9AA', backgroundColor: colors.white },
  resourceIcon: { width: 38, height: 38, borderRadius: borderRadius.sm, alignItems: 'center', justifyContent: 'center' },
  resourceMain: { flex: 1 },
  resourceTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  resourceTitle: { flex: 1, ...typography.bodySm, fontWeight: '600' },
  resourceTime: { ...typography.bodySm, fontWeight: '600', color: colors.text },
  resourceMeta: { ...typography.caption, textTransform: 'capitalize', marginBottom: spacing.sm },
  track: { height: 7, backgroundColor: colors.surface2, borderRadius: borderRadius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: borderRadius.full },
  breakdownSection: { marginTop: spacing.xl, gap: spacing.sm },
  breakdownCard: { padding: spacing.md },
  breakdownTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  breakdownAvatar: { width: 36, height: 36, borderRadius: borderRadius.full, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' },
  breakdownInitials: { fontSize: 11, fontWeight: '600', color: colors.brandDark },
  breakdownMain: { flex: 1 },
  breakdownTitle: { ...typography.bodySm, fontWeight: '600' },
  breakdownMeta: { ...typography.caption },
  breakdownTime: { ...typography.bodySm, fontWeight: '600' },
});
