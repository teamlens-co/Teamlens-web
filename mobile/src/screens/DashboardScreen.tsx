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
import { Avatar, MiniIcon, ScreenShell } from '../components/IosKit';
import { borderRadius, colors, shadow, spacing, typography } from '../theme';
import type { DashboardAnalytics, ManualTimeRequest, Screenshot, Team, User } from '../types';

const bars = [18, 26, 22, 34, 48, 64, 72, 68, 76, 58, 46, 36];

const todayRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { start: start.toISOString(), end: now.toISOString() };
};

const formatHours = (seconds?: number, minutes?: number) => {
  const totalSeconds = seconds ?? (minutes ?? 0) * 60;
  return `${(totalSeconds / 3600).toFixed(1)}h`;
};

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [manualRequests, setManualRequests] = useState<ManualTimeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const range = todayRange();
    const [analyticsResult, usersResult, teamsResult, screenshotsResult, manualResult] = await Promise.all([
      api.getDashboardAnalytics(range.start, range.end),
      api.getUsers(),
      api.getTeams(),
      api.getScreenshots({ startDate: range.start, endDate: range.end, limit: 8 }),
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

  const productivity = Math.min(100, Math.max(0, Math.round(analytics?.productivityPercent ?? analytics?.activePercentage ?? 0)));
  const activeHours = formatHours(analytics?.activeSeconds, analytics?.totalActiveMinutes);
  const pending = manualRequests.filter((item) => item.status?.toLowerCase() === 'pending').length;

  const stats = useMemo(() => [
    { label: 'Hours', value: activeHours, note: 'tracked today', icon: 'clock', tone: colors.brand },
    { label: 'Productivity', value: `${productivity}%`, note: 'active ratio', icon: 'target', tone: colors.success },
    { label: 'Screenshots', value: String(screenshots.length), note: 'recent captures', icon: 'image', tone: '#2563EB' },
    { label: 'Pending', value: String(pending), note: 'manual time', icon: 'warn', tone: colors.warning },
  ], [activeHours, pending, productivity, screenshots.length]);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const openEmployeesDashboard = () => {
    navigation.navigate('Main', { screen: 'Team' });
  };

  return (
    <ScreenShell>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MiniIcon name="back" color={colors.brand} size={22} />
          <Text style={styles.backText}>Home</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Dashboard</Text>
            <Text style={styles.subtitle}>Daily workspace overview</Text>
          </View>
          {loading ? <ActivityIndicator color={colors.brand} /> : null}
        </View>

        <TouchableOpacity style={styles.employeeCta} activeOpacity={0.84} onPress={openEmployeesDashboard}>
          <View style={styles.employeeCtaIcon}>
            <MiniIcon name="team" color={colors.white} size={24} />
          </View>
          <View style={styles.employeeCtaText}>
            <Text style={styles.employeeCtaTitle}>Employees dashboard</Text>
            <Text style={styles.employeeCtaSub}>Open people, teams, invites, and employee details</Text>
          </View>
          <MiniIcon name="forward" color={colors.mutedLight} size={18} />
        </TouchableOpacity>

        <View style={styles.statGrid}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: `${stat.tone}18` }]}>
                <MiniIcon name={stat.icon} color={stat.tone} size={18} />
              </View>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
              <Text style={styles.statNote}>{stat.note}</Text>
            </View>
          ))}
        </View>

        <View style={styles.chartCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Today&apos;s productivity</Text>
            <Text style={styles.sectionMeta}>{teams.length} teams</Text>
          </View>
          <View style={styles.barChart}>
            {bars.map((bar, index) => (
              <View key={`${bar}-${index}`} style={styles.barSlot}>
                <View style={[styles.barMain, { height: bar }]} />
                <View style={[styles.barTop, { height: Math.max(6, 100 - productivity > 15 ? 14 : 8) }]} />
              </View>
            ))}
          </View>
          <View style={styles.axisRow}>
            <Text style={styles.axisText}>8A</Text>
            <Text style={styles.axisText}>11A</Text>
            <Text style={styles.axisText}>2P</Text>
            <Text style={styles.axisText}>5P</Text>
          </View>
        </View>

        <View style={styles.teamHeader}>
          <Text style={styles.sectionTitle}>Team status</Text>
          <TouchableOpacity onPress={openEmployeesDashboard} activeOpacity={0.8}>
            <Text style={styles.openLink}>All employees</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.employeeList}>
          {users.slice(0, 5).map((item, index) => {
            const score = Math.max(12, Math.min(96, productivity - index * 4 + 8));
            return (
              <TouchableOpacity key={item.id} style={styles.employeeRow} activeOpacity={0.82} onPress={openEmployeesDashboard}>
                <Avatar name={item.fullName} size={44} online={item.status?.toLowerCase() === 'active' || index < 3} />
                <View style={styles.employeeInfo}>
                  <Text style={styles.employeeName} numberOfLines={1}>{item.fullName}</Text>
                  <Text style={styles.employeeMeta} numberOfLines={1}>{item.role.toLowerCase()} • {formatHours((analytics?.activeSeconds || 0) / Math.max(1, users.length))}</Text>
                </View>
                <View style={styles.scoreTrack}>
                  <View style={[styles.scoreFill, { width: `${score}%`, backgroundColor: score < 45 ? colors.danger : colors.success }]} />
                </View>
                <Text style={styles.scoreText}>{score}%</Text>
              </TouchableOpacity>
            );
          })}
          {users.length === 0 ? (
            <View style={styles.emptyTeam}>
              <Text style={styles.emptyText}>No employees found yet.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.md, marginLeft: -4 },
  backText: { ...typography.bodySm, color: colors.brand, fontWeight: '500' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg },
  title: { ...typography.h1, fontSize: 32 },
  subtitle: { ...typography.bodySm, color: colors.muted, marginTop: 3 },
  employeeCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadow.sm,
  },
  employeeCtaIcon: { width: 52, height: 52, borderRadius: 17, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  employeeCtaText: { flex: 1 },
  employeeCtaTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  employeeCtaSub: { fontSize: 12, color: colors.muted, marginTop: 3, lineHeight: 17 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: {
    width: '48.7%',
    minHeight: 132,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadow.sm,
  },
  statIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  statValue: { fontSize: 27, fontWeight: '600', color: colors.text },
  statLabel: { fontSize: 13, color: colors.text, marginTop: 4 },
  statNote: { fontSize: 12, color: colors.muted, marginTop: 3 },
  chartCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow.sm,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  sectionMeta: { fontSize: 12, color: colors.muted },
  barChart: { height: 132, flexDirection: 'row', alignItems: 'flex-end', gap: 9, paddingTop: spacing.md },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  barMain: { width: 13, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: colors.success },
  barTop: { width: 13, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: colors.brand },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingHorizontal: 8 },
  axisText: { fontSize: 11, color: colors.mutedLight },
  teamHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  openLink: { color: colors.brand, fontWeight: '500', fontSize: 13 },
  employeeList: { gap: spacing.sm },
  employeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadow.sm,
  },
  employeeInfo: { flex: 1 },
  employeeName: { fontSize: 15, fontWeight: '600', color: colors.text },
  employeeMeta: { fontSize: 12, color: colors.muted, marginTop: 3 },
  scoreTrack: { width: 52, height: 6, borderRadius: borderRadius.full, backgroundColor: colors.divider, overflow: 'hidden' },
  scoreFill: { height: '100%', borderRadius: borderRadius.full },
  scoreText: { width: 38, textAlign: 'right', fontSize: 12, color: colors.muted },
  emptyTeam: { backgroundColor: colors.card, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, alignItems: 'center' },
  emptyText: { ...typography.bodySm, color: colors.muted },
});
