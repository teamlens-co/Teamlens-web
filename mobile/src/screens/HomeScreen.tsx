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
import { Avatar, MiniIcon, ScreenShell } from '../components/IosKit';
import { borderRadius, colors, shadow, spacing, typography } from '../theme';
import type { DashboardAnalytics, ManualTimeRequest, Screenshot, Team, User } from '../types';

type ModuleRoute =
  | 'Dashboard'
  | 'Team'
  | 'Activities'
  | 'Attendance'
  | 'Live'
  | 'Screenshots'
  | 'Recordings'
  | 'ManualTime'
  | 'Reports'
  | 'AI'
  | 'ProductivityLabels'
  | 'Alerts'
  | 'Settings';

const dashboardModule: { label: string; subtitle: string; icon: string; route: ModuleRoute; tone: string } = {
  label: 'Dashboard',
  subtitle: 'Main overview',
  icon: 'grid',
  route: 'Dashboard',
  tone: colors.brand,
};

const launcherModules: Array<{ label: string; subtitle: string; icon: string; route: ModuleRoute; tone: string }> = [
  { label: 'Employees', subtitle: 'People', icon: 'team', route: 'Team', tone: colors.brand },
  { label: 'Attendance', subtitle: 'Status', icon: 'clock', route: 'Attendance', tone: colors.warning },
  { label: 'Reports', subtitle: 'Usage', icon: 'bars', route: 'Reports', tone: '#0F766E' },
  { label: 'Screenshots', subtitle: 'Proof', icon: 'image', route: 'Screenshots', tone: '#2563EB' },
  { label: 'Activities', subtitle: 'Timeline', icon: 'target', route: 'Activities', tone: '#6B5DD3' },
  { label: 'Manual Time', subtitle: 'Requests', icon: 'card-text', route: 'ManualTime', tone: colors.danger },
  { label: 'Recordings', subtitle: 'Videos', icon: 'camera', route: 'Recordings', tone: '#7C3AED' },
  { label: 'Live View', subtitle: 'Screens', icon: 'play', route: 'Live', tone: colors.success },
  { label: 'AI Center', subtitle: 'Insights', icon: 'brain', route: 'AI', tone: '#9333EA' },
  { label: 'Productivity', subtitle: 'Labels', icon: 'shield', route: 'ProductivityLabels', tone: '#16A34A' },
  { label: 'Alerts', subtitle: 'Signals', icon: 'bell', route: 'Alerts', tone: '#EA580C' },
  { label: 'Settings', subtitle: 'Account', icon: 'settings', route: 'Settings', tone: '#7E6F65' },
];

const activityBars = [6, 8, 5, 7, 6, 9, 28, 42, 54, 66, 62, 72, 58, 68, 76, 61, 52, 12, 6, 5, 8, 6, 11, 7];

const dateRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { start: start.toISOString(), end: now.toISOString() };
};

const hours = (seconds?: number, minutes?: number) => {
  const totalSeconds = seconds ?? (minutes ?? 0) * 60;
  return `${(totalSeconds / 3600).toFixed(1)}h`;
};

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [manualRequests, setManualRequests] = useState<ManualTimeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const range = dateRange();
    const [analyticsResult, usersResult, teamsResult, screenshotsResult, manualResult] = await Promise.all([
      api.getDashboardAnalytics(range.start, range.end),
      api.getUsers(),
      api.getTeams(),
      api.getScreenshots({ startDate: range.start, endDate: range.end, limit: 6 }),
      api.getManualTimeRequests(),
    ]);

    setAnalytics(analyticsResult.ok ? analyticsResult.data ?? null : null);
    setUsers(usersResult.ok && Array.isArray(usersResult.data) ? usersResult.data : []);
    setTeams(teamsResult.ok && Array.isArray(teamsResult.data) ? teamsResult.data : []);
    setScreenshots(screenshotsResult.ok && Array.isArray(screenshotsResult.data) ? screenshotsResult.data : []);
    setManualRequests(manualResult.ok && Array.isArray(manualResult.data) ? manualResult.data : []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const productive = Math.min(100, Math.max(0, Math.round(analytics?.productivityPercent ?? analytics?.activePercentage ?? 0)));
  const activeToday = hours(analytics?.activeSeconds, analytics?.totalActiveMinutes);
  const pendingCount = manualRequests.filter((item) => item.status?.toLowerCase() === 'pending').length;
  const activeUsers = users.filter((item) => item.status?.toLowerCase() === 'active').length || users.length;
  const glance = useMemo(() => [
    { label: 'Active now', value: String(activeUsers), note: 'employees online', tone: colors.success },
    { label: 'Hours today', value: activeToday, note: 'team total', tone: colors.brand },
    { label: 'Productivity', value: `${productive}%`, note: `${teams.length} teams tracked`, tone: colors.info },
    { label: 'Needs review', value: String(pendingCount), note: 'manual requests', tone: colors.warning },
  ], [activeToday, activeUsers, pendingCount, productive, teams.length]);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  return (
    <ScreenShell style={styles.shell}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Text style={styles.greeting}>Good morning,</Text>
            <Text style={styles.title}>TeamLens</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} activeOpacity={0.82}>
            <Avatar name={user?.fullName || 'User'} size={48} online />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionKicker}>App screens</Text>
        <Text style={styles.sectionHint}>Tap any module below to open the mobile view.</Text>

        <TouchableOpacity style={styles.dashboardTile} activeOpacity={0.84} onPress={() => navigation.navigate(dashboardModule.route)}>
          <View style={[styles.dashboardIcon, { backgroundColor: dashboardModule.tone }]}>
            <MiniIcon name={dashboardModule.icon} color={colors.white} size={28} />
          </View>
          <View style={styles.dashboardText}>
            <Text style={styles.dashboardTitle}>{dashboardModule.label}</Text>
            <Text style={styles.dashboardSubtitle}>{dashboardModule.subtitle}</Text>
          </View>
          <MiniIcon name="forward" color={colors.mutedLight} size={18} />
        </TouchableOpacity>

        <View style={styles.launcherGrid}>
          {launcherModules.map((item) => (
            <TouchableOpacity key={item.label} style={styles.launcherItem} activeOpacity={0.82} onPress={() => navigation.navigate(item.route)}>
              <View style={[styles.launcherIcon, { backgroundColor: item.tone }]}>
                <MiniIcon name={item.icon} color={colors.white} size={28} />
              </View>
              <Text style={styles.launcherLabel} numberOfLines={1}>{item.label}</Text>
              <Text style={styles.launcherSub} numberOfLines={1}>{item.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.quickTitle}>Quick glance</Text>
          {loading ? <ActivityIndicator color={colors.brand} /> : null}
        </View>

        <View style={styles.glanceGrid}>
          {glance.map((item) => (
            <View key={item.label} style={styles.glanceCard}>
              <Text style={styles.glanceValue}>{item.value}</Text>
              <Text style={styles.glanceLabel}>{item.label}</Text>
              <Text style={[styles.glanceNote, { color: item.tone }]}>{item.note}</Text>
            </View>
          ))}
        </View>

        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Activity timeline</Text>
            <Text style={styles.chartMeta}>Today</Text>
          </View>
          <View style={styles.barChart}>
            {activityBars.map((value, index) => (
              <View key={`${value}-${index}`} style={styles.barSlot}>
                <View style={[styles.bar, { height: Math.max(5, value), backgroundColor: value > 50 ? colors.brand : colors.success }]} />
              </View>
            ))}
          </View>
          <View style={styles.axisRow}>
            <Text style={styles.axisText}>0</Text>
            <Text style={styles.axisText}>8</Text>
            <Text style={styles.axisText}>12</Text>
            <Text style={styles.axisText}>16</Text>
            <Text style={styles.axisText}>20</Text>
          </View>
        </View>

        <View style={styles.mixCard}>
          <Text style={styles.chartTitle}>Productivity mix</Text>
          <View style={styles.mixTrack}>
            <View style={[styles.mixFill, { flex: productive || 1, backgroundColor: colors.success }]} />
            <View style={[styles.mixFill, { flex: 20, backgroundColor: colors.warning }]} />
            <View style={[styles.mixFill, { flex: Math.max(5, 100 - productive - 20), backgroundColor: colors.danger }]} />
          </View>
          <View style={styles.mixLegend}>
            <LegendItem label="Productive" value={`${productive}%`} color={colors.success} />
            <LegendItem label="Neutral" value="20%" color={colors.warning} />
            <LegendItem label="Unproductive" value={`${Math.max(0, 100 - productive - 20)}%`} color={colors.danger} />
          </View>
        </View>

        <View style={styles.currentCard}>
          <View style={styles.currentIcon}>
            <MiniIcon name="image" color={colors.brand} size={20} />
          </View>
          <View style={styles.currentText}>
            <Text style={styles.currentTitle}>Current signal</Text>
            <Text style={styles.currentMeta}>
              {screenshots[0]?.employeeName || screenshots[0]?.activeApplication || 'No recent capture'} • {screenshots.length} captures today
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function LegendItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}: {value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { backgroundColor: '#F8F5F2' },
  content: { paddingBottom: spacing.xxl + 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  brandBlock: { flex: 1, paddingRight: spacing.md },
  greeting: { fontSize: 18, color: colors.muted, marginBottom: 2 },
  title: { fontSize: 34, lineHeight: 38, fontWeight: '600', color: colors.text, letterSpacing: 0 },
  sectionKicker: { ...typography.label, color: colors.mutedLight, marginBottom: 4 },
  sectionHint: { fontSize: 14, fontWeight: '400', color: colors.muted, marginBottom: spacing.md },
  dashboardTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.xl,
    ...shadow.sm,
  },
  dashboardIcon: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  dashboardText: { flex: 1 },
  dashboardTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  dashboardSubtitle: { fontSize: 12, fontWeight: '400', color: colors.muted, marginTop: 3 },
  launcherGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.xl, marginBottom: spacing.xl },
  launcherItem: { width: '33.333%', alignItems: 'center', paddingHorizontal: 4 },
  launcherIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 9,
    ...shadow.md,
  },
  launcherLabel: { fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center' },
  launcherSub: { fontSize: 11, fontWeight: '400', color: colors.muted, textAlign: 'center', marginTop: 2 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  quickTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  glanceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  glanceCard: {
    width: '48.7%',
    minHeight: 116,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.sm,
  },
  glanceValue: { fontSize: 25, fontWeight: '600', color: colors.text },
  glanceLabel: { fontSize: 13, color: colors.muted, marginTop: 7 },
  glanceNote: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  chartCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  chartTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  chartMeta: { fontSize: 12, fontWeight: '600', color: colors.mutedLight },
  barChart: { height: 104, flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingTop: spacing.md },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: 7, borderRadius: 8 },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, marginTop: 8 },
  axisText: { fontSize: 10, color: colors.mutedLight, fontWeight: '600' },
  mixCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  mixTrack: { height: 18, flexDirection: 'row', overflow: 'hidden', borderRadius: borderRadius.full, marginTop: spacing.md, marginBottom: spacing.md },
  mixFill: { height: '100%' },
  mixLegend: { gap: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { fontSize: 13, color: colors.text, fontWeight: '600' },
  currentCard: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.sm,
  },
  currentIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandLight },
  currentText: { flex: 1 },
  currentTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  currentMeta: { fontSize: 13, color: colors.muted, marginTop: 4 },
});
