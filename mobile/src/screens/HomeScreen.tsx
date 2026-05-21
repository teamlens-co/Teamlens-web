import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity, Dimensions,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { colors, borderRadius, spacing, shadow, typography } from '../theme';
import { AppCard, Avatar, MiniIcon, ScreenShell } from '../components/IosKit';
import type { DashboardAnalytics, CalendarDay } from '../types';

const { width } = Dimensions.get('window');

type HomeMode = 'launcher' | 'dashboard';
type LauncherItem = {
  label: string;
  icon: string;
  color: string;
  action?: 'dashboard';
  route?: 'Team' | 'AI' | 'Alerts' | 'Settings' | 'Activities' | 'Live';
};

const fallbackTeam = [
  { name: 'Sarah Chen', app: 'VS Code', hours: '6.5h', score: 92, online: true },
  { name: 'Marcus Johnson', app: 'Zoom', hours: '5.2h', score: 78, online: true },
  { name: 'Emily Rodriguez', app: 'Figma', hours: '7.1h', score: 88, online: true },
  { name: 'David Kim', app: 'Chrome', hours: '3.8h', score: 12, online: false },
  { name: 'Priya Patel', app: 'Google Docs', hours: '6.8h', score: 95, online: true },
];

const productivityBars = [86, 72, 90, 84, 38, 66, 91, 78, 70, 47];
const redBars = [12, 18, 7, 10, 44, 20, 8, 13, 24, 31];
const hourLabels = ['8A', '9A', '10A', '11A', '12P', '1P', '2P', '3P', '4P', '5P'];

const launcherItems: LauncherItem[] = [
  { label: 'Dashboard', icon: 'grid', color: colors.brand, action: 'dashboard' },
  { label: 'Employees', icon: 'team', color: colors.info, route: 'Team' },
  { label: 'Live View', icon: 'play', color: colors.success, route: 'Live' },
  { label: 'Projects', icon: 'folder', color: '#7C3FD1', action: 'dashboard' },
  { label: 'AI Center', icon: 'brain', color: '#7C3FD1', route: 'AI' },
  { label: 'Reports', icon: 'bars', color: colors.brand, action: 'dashboard' },
  { label: 'Alerts', icon: 'warn', color: colors.warning, route: 'Alerts' },
  { label: 'Settings', icon: 'settings', color: colors.muted, route: 'Settings' },
  { label: 'Timeline', icon: 'bars', color: colors.warning, route: 'Activities' },
  { label: 'Help', icon: 'help-circle', color: colors.success, route: 'Settings' },
];

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [mode, setMode] = useState<HomeMode>('launcher'); // Default to launcher as requested
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

    const [analyticsResult] = await Promise.all([
      api.getDashboardAnalytics(startOfMonth, endOfMonth),
    ]);

    if (analyticsResult.ok && analyticsResult.data) setAnalytics(analyticsResult.data);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const onRefresh = () => { setRefreshing(true); fetchData(); };
  const activeMinutes = (analytics?.totalActiveMinutes ?? Math.round((analytics?.activeSeconds ?? 0) / 60)) || 2832;
  const productivePercent = Math.round(analytics?.activePercentage ?? analytics?.productivityPercent ?? 83);
  const hoursToday = (activeMinutes / 60).toFixed(1);
  const screenshots = analytics?.sessionCount ? analytics.sessionCount * 96 : 1248;
  const firstName = user?.fullName?.split(' ')[0] || 'there';

  const openLauncherItem = (item: LauncherItem) => {
    if (item.action === 'dashboard') {
      setMode('dashboard');
      return;
    }
    if (item.route) navigation.navigate(item.route);
  };

  if (mode === 'launcher') {
    return (
      <LauncherView
        firstName={firstName}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onBack={() => setMode('dashboard')}
        openItem={openLauncherItem}
        hoursToday={hoursToday}
        productivePercent={productivePercent}
      />
    );
  }

  return (
    <DashboardView
      firstName={firstName}
      hoursToday={hoursToday}
      productivePercent={productivePercent}
      screenshots={screenshots}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onLauncher={() => setMode('launcher')}
      loading={loading}
    />
  );
}

function LauncherView({
  firstName,
  refreshing,
  onRefresh,
  onBack,
  openItem,
  hoursToday,
  productivePercent,
}: any) {
  return (
    <ScreenShell>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <View style={styles.launcherHeader}>
          <View>
            <Text style={styles.greeting}>Good morning,</Text>
            <Text style={styles.brandTitle}>TeamLens</Text>
          </View>
          <TouchableOpacity style={styles.dashboardToggle} onPress={onBack}>
            <MiniIcon name="eye" color={colors.white} size={24} />
          </TouchableOpacity>
        </View>

        <Text style={styles.previewTitle}>iOS App Screens Preview</Text>
        <Text style={styles.previewCopy}>Tap any screen below to preview its mobile layout</Text>

        <View style={styles.launcherGrid}>
          {launcherItems.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={styles.launcherItem}
              activeOpacity={0.7}
              onPress={() => openItem(item)}
            >
              <View style={[styles.launcherIcon, { backgroundColor: item.color }]}>
                <MiniIcon name={item.icon} color={colors.white} size={32} />
              </View>
              <Text style={styles.launcherLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>QUICK GLANCE</Text>
        </View>

        <View style={styles.glanceGrid}>
          <GlanceCard label="Active Now" value="8" sub="employees online" color={colors.brand} />
          <GlanceCard label="Hours Today" value={hoursToday} sub="team total" color={colors.brand} />
          <GlanceCard label="Productivity" value={`${productivePercent}%`} sub="+5% vs last week" color={colors.brand} />
          <GlanceCard label="AI Insights" value="6" sub="1 critical" color={colors.brand} />
        </View>

        <TouchableOpacity style={styles.websiteLink}>
          <Text style={styles.websiteLinkText}>← Back to Website</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenShell>
  );
}

function GlanceCard({ label, value, sub, color }: any) {
  return (
    <AppCard style={styles.glanceCard}>
      <Text style={styles.glanceValue}>{value}</Text>
      <Text style={styles.glanceLabel}>{label}</Text>
      <Text style={[styles.glanceSub, { color }]}>{sub}</Text>
    </AppCard>
  );
}

function DashboardView({
  firstName,
  hoursToday,
  productivePercent,
  screenshots,
  refreshing,
  onRefresh,
  onLauncher,
  loading,
}: any) {
  return (
    <ScreenShell>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Dashboard</Text>
            <Text style={styles.brandTitle}>Hello, {firstName}</Text>
          </View>
          <TouchableOpacity style={styles.profileButton} onPress={onLauncher}>
            <Avatar name={firstName} size={44} />
          </TouchableOpacity>
        </View>

        <View style={styles.metricRow}>
          <MetricCard label="Hours" value={hoursToday} icon="clock" color={colors.brand} trend="+12%" />
          <MetricCard label="Focus" value={`${productivePercent}%`} icon="target" color={colors.success} trend="+4%" />
        </View>
        <View style={styles.metricRow}>
          <MetricCard label="Captures" value={screenshots.toLocaleString()} icon="camera" color={colors.info} />
          <MetricCard label="Activity" value="High" icon="bars" color={colors.warning} />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Team Status</Text>
          <TouchableOpacity><Text style={styles.linkText}>View All</Text></TouchableOpacity>
        </View>

        {fallbackTeam.slice(0, 3).map((member) => (
          <AppCard key={member.name} style={styles.memberCard}>
            <Avatar name={member.name} size={40} online={member.online} />
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{member.name}</Text>
              <Text style={styles.memberApp}>{member.app} • {member.hours}</Text>
            </View>
            <View style={styles.memberScore}>
              <Text style={[styles.scoreText, { color: member.score > 80 ? colors.success : colors.warning }]}>
                {member.score}%
              </Text>
              <View style={styles.scoreBarContainer}>
                <View style={[styles.scoreBar, { width: `${member.score}%`, backgroundColor: member.score > 80 ? colors.success : colors.warning }]} />
              </View>
            </View>
          </AppCard>
        ))}

        <AppCard style={styles.chartCard}>
          <Text style={styles.chartTitle}>Activity Timeline</Text>
          <View style={styles.chartContainer}>
            {productivityBars.map((height, index) => (
              <View key={index} style={styles.barGroup}>
                <View style={styles.barWrapper}>
                  <View style={[styles.barBase, { height: (height / 100) * 80, backgroundColor: colors.brand }]} />
                </View>
                <Text style={styles.barLabel}>{hourLabels[index]}</Text>
              </View>
            ))}
          </View>
        </AppCard>
      </ScrollView>
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.brand} />
        </View>
      )}
    </ScreenShell>
  );
}

function MetricCard({ label, value, icon, color, trend }: any) {
  return (
    <AppCard style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: color + '20' }]}>
        <MiniIcon name={icon} color={color} size={20} />
      </View>
      <View style={styles.metricData}>
        <Text style={styles.metricValue}>{value}</Text>
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      {trend && (
        <View style={styles.trendTag}>
          <Text style={styles.trendText}>{trend}</Text>
        </View>
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  greeting: {
    ...typography.bodySm,
    color: colors.muted,
    fontWeight: '600',
  },
  brandTitle: {
    ...typography.h2,
    color: colors.text,
  },
  profileButton: {
    ...shadow.sm,
  },
  launcherHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  dashboardToggle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
  },
  previewTitle: {
    ...typography.label,
    color: colors.muted,
    marginBottom: spacing.sm,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  previewCopy: {
    ...typography.bodySm,
    color: colors.mutedLight,
    marginBottom: spacing.xl,
    fontSize: 13,
  },
  launcherGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: spacing.xxl,
  },
  launcherItem: {
    width: (width - spacing.lg * 2 - spacing.md * 3) / 4,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  launcherIcon: {
    width: 60,
    height: 60,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    ...shadow.md,
  },
  launcherLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginTop: 2,
  },
  glanceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  glanceCard: {
    width: (width - spacing.lg * 2 - spacing.md) / 2,
    padding: spacing.lg,
    backgroundColor: colors.surface2,
    borderWidth: 0,
    ...shadow.sm,
  },
  glanceValue: {
    ...typography.h2,
    fontSize: 24,
    marginBottom: 4,
    color: colors.brand,
  },
  glanceLabel: {
    ...typography.label,
    fontSize: 10,
    color: colors.muted,
  },
  glanceSub: {
    fontSize: 11,
    color: colors.mutedLight,
    marginTop: 2,
  },
  websiteLink: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  websiteLinkText: {
    fontSize: 14,
    color: colors.brand,
    fontWeight: '600',
  },
  promoCard: {
    flexDirection: 'row',
    backgroundColor: colors.brandLight,
    borderColor: colors.brand,
    borderWidth: 1,
    padding: spacing.lg,
  },
  promoInfo: {
    flex: 1,
  },
  promoTitle: {
    ...typography.h3,
    color: colors.brand,
    marginBottom: 4,
  },
  promoText: {
    ...typography.bodySm,
    color: colors.muted,
    marginBottom: spacing.md,
  },
  promoButton: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  promoButtonText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 12,
  },
  promoIconContainer: {
    justifyContent: 'center',
    paddingLeft: spacing.md,
  },
  summaryCard: {
    backgroundColor: colors.brand,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 0,
    ...shadow.md,
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 4,
  },
  summaryBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  summaryTime: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  summaryContent: {
    ...typography.body,
    color: colors.white,
    lineHeight: 22,
  },
  bold: {
    fontWeight: '800',
  },
  mutedText: {
    opacity: 0.8,
  },
  metricRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  metricCard: {
    flex: 1,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  metricData: {
    flex: 1,
  },
  metricValue: {
    ...typography.h3,
    fontSize: 20,
  },
  metricLabel: {
    ...typography.caption,
    marginTop: -2,
  },
  trendTag: {
    position: 'absolute',
    top: 6,
    right: 8,
  },
  trendText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.success,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
  },
  linkText: {
    ...typography.bodySm,
    color: colors.brand,
    fontWeight: '600',
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  memberInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  memberName: {
    ...typography.body,
    fontWeight: '700',
  },
  memberApp: {
    ...typography.caption,
  },
  memberScore: {
    alignItems: 'flex-end',
    width: 60,
  },
  scoreText: {
    ...typography.bodySm,
    fontWeight: '800',
    marginBottom: 4,
  },
  scoreBarContainer: {
    width: '100%',
    height: 4,
    backgroundColor: colors.divider,
    borderRadius: 2,
    overflow: 'hidden',
  },
  scoreBar: {
    height: '100%',
    borderRadius: 2,
  },
  chartCard: {
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  chartTitle: {
    ...typography.h3,
    marginBottom: spacing.lg,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 120,
  },
  barGroup: {
    alignItems: 'center',
    flex: 1,
  },
  barWrapper: {
    height: 80,
    width: 12,
    backgroundColor: colors.surface2,
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barBase: {
    width: '100%',
    borderRadius: 6,
  },
  barLabel: {
    fontSize: 9,
    color: colors.muted,
    marginTop: 6,
    fontWeight: '600',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: colors.white,
    padding: 8,
    borderRadius: 20,
    ...shadow.sm,
  },
});
