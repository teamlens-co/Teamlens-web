import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { colors, borderRadius, spacing, shadow, typography } from '../theme';
import { AppCard, Avatar, ScreenShell, MiniIcon } from '../components/IosKit';
import type { Invite, Team, User, UsageReportItem } from '../types';

type DetailTab = 'Overview' | 'Activity' | 'Apps' | 'Reports';

const sampleUsers: User[] = [
  { id: 'sample-marcus', fullName: 'Marcus Johnson', email: 'marcus@company.com', role: 'EMPLOYEE' },
  { id: 'sample-sarah', fullName: 'Sarah Chen', email: 'sarah@company.com', role: 'EMPLOYEE' },
  { id: 'sample-emily', fullName: 'Emily Rodriguez', email: 'emily@company.com', role: 'EMPLOYEE' },
  { id: 'sample-david', fullName: 'David Kim', email: 'david@company.com', role: 'EMPLOYEE' },
  { id: 'sample-priya', fullName: 'Priya Patel', email: 'priya@company.com', role: 'EMPLOYEE' },
];

const sampleApps: UsageReportItem[] = [
  { name: 'VS Code', appName: 'VS Code', domain: '', targetType: 'APP', category: 'PRODUCTIVE', durationSeconds: 102600, samples: 1 },
  { name: 'Slack', appName: 'Slack', domain: '', targetType: 'APP', category: 'NEUTRAL', durationSeconds: 65520, samples: 1 },
  { name: 'Chrome', appName: 'Chrome', domain: '', targetType: 'APP', category: 'NEUTRAL', durationSeconds: 56880, samples: 1 },
  { name: 'Figma', appName: 'Figma', domain: '', targetType: 'APP', category: 'PRODUCTIVE', durationSeconds: 44280, samples: 1 },
  { name: 'Zoom', appName: 'Zoom', domain: '', targetType: 'APP', category: 'PRODUCTIVE', durationSeconds: 34920, samples: 1 },
];

const activityBars = [3, 4, 5, 3, 2, 2, 28, 60, 86, 87, 61, 83, 78, 85, 96, 70, 55, 3, 2, 2, 2, 6, 1, 1];

const formatHours = (seconds: number) => {
  const hours = seconds / 3600;
  if (hours >= 1) return `${hours.toFixed(1)}h`;
  return `${Math.round(seconds / 60)}m`;
};

const categoryTone = (category: string) => {
  const key = category.toUpperCase();
  if (key === 'PRODUCTIVE') return { bg: colors.successTint, text: colors.success, label: 'Productive' };
  if (key === 'UNPRODUCTIVE') return { bg: colors.dangerTint, text: colors.danger, label: 'Unproductive' };
  return { bg: colors.infoTint, text: colors.info, label: 'Neutral' };
};

export default function TeamScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [usageItems, setUsageItems] = useState<UsageReportItem[]>([]);
  const [activeTab, setActiveTab] = useState<DetailTab>('Activity');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchUsers = useCallback(async () => {
    const [result, teamResult, inviteResult] = await Promise.all([
      api.getUsers(),
      api.getTeams(),
      api.getInvites(),
    ]);
    const nextUsers = result.ok && Array.isArray(result.data) ? result.data : [];
    setUsers(nextUsers.length ? nextUsers : sampleUsers);
    setTeams(teamResult.ok && Array.isArray(teamResult.data) ? teamResult.data : []);
    setInvites(inviteResult.ok && Array.isArray(inviteResult.data) ? inviteResult.data : []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  const fetchUsage = useCallback(async (userId: string) => {
    setDetailLoading(true);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const result = userId.startsWith('sample-')
      ? { ok: false, data: null }
      : await api.getUsageReport(start, now.toISOString(), userId);
    const rows = result.ok && Array.isArray(result.data?.items) ? result.data.items : sampleApps;
    setUsageItems(rows.length ? rows : sampleApps);
    setDetailLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchUsers(); }, [fetchUsers]));

  const openUser = (user: User) => {
    setSelectedUser(user);
    setActiveTab('Activity');
    void fetchUsage(user.id);
  };

  const onRefresh = () => {
    setRefreshing(true);
    if (selectedUser) {
      void fetchUsage(selectedUser.id).finally(() => setRefreshing(false));
    } else {
      void fetchUsers();
    }
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim()) {
      Alert.alert('Email required', 'Enter an employee email address.');
      return;
    }
    const result = await api.createInvite(inviteEmail.trim(), 'EMPLOYEE');
    if (!result.ok) {
      Alert.alert('Invite failed', result.message || 'Please try again.');
      return;
    }
    setInviteEmail('');
    void fetchUsers();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (selectedUser) {
    return (
      <ScreenShell>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.detailContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          <TouchableOpacity onPress={() => setSelectedUser(null)} style={styles.backButton}>
            <MiniIcon name="back" size={24} color={colors.brand} />
            <Text style={styles.backText}>Team</Text>
          </TouchableOpacity>

          <View style={styles.profileSection}>
            <Avatar name={selectedUser.fullName} size={80} online />
            <View style={styles.profileInfo}>
              <Text style={styles.detailName}>{selectedUser.fullName}</Text>
              <Text style={styles.detailEmail}>{selectedUser.email}</Text>
              <View style={styles.tagRow}>
                <View style={[styles.roleTag, { backgroundColor: selectedUser.role === 'MANAGER' ? colors.brandTint : colors.surface2 }]}>
                  <Text style={[styles.roleTagText, { color: selectedUser.role === 'MANAGER' ? colors.brand : colors.muted }]}>
                    {selectedUser.role === 'MANAGER' ? 'Admin' : 'Employee'}
                  </Text>
                </View>
                <View style={styles.statusTag}>
                  <View style={styles.onlineDot} />
                  <Text style={styles.statusTagText}>Online</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.statGrid}>
            <StatCard value="6.4h" label="Active" icon="clock" color={colors.brand} />
            <StatCard value="92%" label="Score" icon="target" color={colors.success} />
          </View>

          <View style={styles.tabContainer}>
            {(['Activity', 'Apps', 'Reports', 'Overview'] as DetailTab[]).map((tab) => (
              <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[styles.tab, activeTab === tab && styles.tabActive]}>
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === 'Activity' && <ActivityPanel />}
          {activeTab === 'Apps' && <AppsPanel usageItems={usageItems} loading={detailLoading} />}
          {activeTab === 'Reports' && <SimplePanel title="Daily Reports" copy="All clear for today. High activity in primary work apps." />}
          {activeTab === 'Overview' && <OverviewPanel />}
        </ScrollView>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <Text style={styles.title}>Employees</Text>
        <Text style={styles.subtitle}>{users.length} people, {teams.length} teams</Text>

        <AppCard style={styles.inviteCard}>
          <Text style={styles.panelTitle}>Invite teammate</Text>
          <View style={styles.inviteRow}>
            <TextInput
              value={inviteEmail}
              onChangeText={setInviteEmail}
              placeholder="employee@company.com"
              placeholderTextColor={colors.mutedLight}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.inviteInput}
            />
            <TouchableOpacity style={styles.inviteButton} onPress={sendInvite}>
              <MiniIcon name="mail" color={colors.white} size={18} />
            </TouchableOpacity>
          </View>
        </AppCard>

        {teams.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Teams</Text>
            {teams.map((team) => (
              <AppCard key={team.id} style={styles.teamSummary}>
                <View style={styles.teamSummaryIcon}><MiniIcon name="folder" color={colors.brand} size={18} /></View>
                <View style={styles.teamInfo}>
                  <Text style={styles.teamName}>{team.name}</Text>
                  <Text style={styles.teamMeta}>{team.memberCount ?? 0} members</Text>
                </View>
              </AppCard>
            ))}
          </>
        )}

        {invites.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Invites</Text>
            {invites.slice(0, 4).map((invite) => (
              <AppCard key={invite.id} style={styles.teamSummary}>
                <View style={styles.teamSummaryIcon}><MiniIcon name="mail" color={colors.info} size={18} /></View>
                <View style={styles.teamInfo}>
                  <Text style={styles.teamName}>{invite.email}</Text>
                  <Text style={styles.teamMeta}>{invite.status}</Text>
                </View>
              </AppCard>
            ))}
          </>
        )}

        <Text style={styles.sectionLabel}>People</Text>

        {users.map((user, index) => {
          const score = [78, 92, 88, 12, 95, 84][index % 6];
          return (
            <TouchableOpacity key={user.id} activeOpacity={0.7} onPress={() => openUser(user)}>
              <AppCard style={styles.teamRow}>
                <Avatar name={user.fullName} size={48} online={score > 30} />
                <View style={styles.teamInfo}>
                  <Text style={styles.teamName}>{user.fullName}</Text>
                  <Text style={styles.teamMeta}>{user.role === 'MANAGER' ? 'Admin' : 'Engineering'}</Text>
                </View>
                <View style={styles.scoreInfo}>
                  <Text style={[styles.scoreValue, { color: score > 80 ? colors.success : score > 50 ? colors.warning : colors.danger }]}>
                    {score}%
                  </Text>
                  <MiniIcon name="forward" size={16} color={colors.mutedLight} />
                </View>
              </AppCard>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </ScreenShell>
  );
}

function StatCard({ value, label, icon, color }: any) {
  return (
    <AppCard style={styles.statCard}>
      <View style={[styles.iconCircle, { backgroundColor: color + '15' }]}>
        <MiniIcon name={icon} color={color} size={18} />
      </View>
      <View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </AppCard>
  );
}

function ActivityPanel() {
  const axisLabels = ['8A', '12P', '4P', '8P'];
  return (
    <AppCard style={styles.activityCard}>
      <Text style={styles.panelTitle}>Focus Intensity</Text>
      <View style={styles.chartContainer}>
        <View style={styles.chartBars}>
          {activityBars.map((height, index) => (
            <View key={index} style={[styles.activityBar, { height: (height / 100) * 120 }]} />
          ))}
        </View>
        <View style={styles.chartAxis}>
          {axisLabels.map(label => <Text key={label} style={styles.axisText}>{label}</Text>)}
        </View>
      </View>
    </AppCard>
  );
}

function AppsPanel({ usageItems, loading }: { usageItems: UsageReportItem[]; loading: boolean }) {
  return (
    <AppCard style={styles.panel}>
      <Text style={styles.panelTitle}>Top Applications</Text>
      {loading ? (
        <ActivityIndicator color={colors.brand} />
      ) : (
        usageItems.slice(0, 6).map((item, index) => {
          const tone = categoryTone(item.category);
          return (
            <View key={index} style={styles.usageItem}>
              <View style={styles.usageMain}>
                <Text style={styles.usageName}>{item.appName || item.name}</Text>
                <View style={[styles.categoryBadge, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.categoryText, { color: tone.text }]}>{tone.label}</Text>
                </View>
              </View>
              <Text style={styles.usageTime}>{formatHours(item.durationSeconds)}</Text>
            </View>
          );
        })
      )}
    </AppCard>
  );
}

function OverviewPanel() {
  return (
    <AppCard style={styles.panel}>
      <Text style={styles.panelTitle}>Performance Summary</Text>
      <Text style={styles.panelCopy}>Strong concentration during morning hours. Consistent usage of development tools. No significant idle periods detected.</Text>
    </AppCard>
  );
}

function SimplePanel({ title, copy }: any) {
  return (
    <AppCard style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      <Text style={styles.panelCopy}>{copy}</Text>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  listContent: { paddingBottom: spacing.xxl },
  title: { ...typography.h1, marginBottom: 4 },
  subtitle: { ...typography.bodySm, color: colors.muted, marginBottom: spacing.lg },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  teamInfo: { flex: 1, marginLeft: spacing.md },
  teamName: { ...typography.body, fontWeight: '600' },
  teamMeta: { ...typography.caption, color: colors.muted },
  scoreInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreValue: { ...typography.bodySm, fontWeight: '600' },
  inviteCard: { padding: spacing.md, marginBottom: spacing.lg },
  inviteRow: { flexDirection: 'row', gap: spacing.sm },
  inviteInput: { flex: 1, backgroundColor: colors.surface2, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, color: colors.text },
  inviteButton: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { ...typography.label, marginBottom: spacing.sm, marginTop: spacing.sm },
  teamSummary: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, marginBottom: spacing.sm },
  teamSummaryIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  detailContent: { paddingBottom: spacing.xxl },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.lg, marginLeft: -4 },
  backText: { ...typography.body, color: colors.brand, fontWeight: '600' },
  profileSection: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  profileInfo: { flex: 1, marginLeft: spacing.lg },
  detailName: { ...typography.h2, marginBottom: 2 },
  detailEmail: { ...typography.bodySm, color: colors.muted, marginBottom: 8 },
  tagRow: { flexDirection: 'row', gap: 8 },
  roleTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  roleTagText: { fontSize: 11, fontWeight: '600' },
  statusTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.successTint, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  statusTagText: { fontSize: 11, fontWeight: '600', color: colors.success },
  statGrid: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  statCard: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statValue: { ...typography.h3, fontSize: 18 },
  statLabel: { ...typography.caption, marginTop: -2 },
  tabContainer: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: borderRadius.md, padding: 4, marginBottom: spacing.lg },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: borderRadius.sm },
  tabActive: { backgroundColor: colors.white, ...shadow.sm },
  tabText: { ...typography.bodySm, fontWeight: '600', color: colors.muted },
  tabTextActive: { color: colors.text },
  activityCard: { padding: spacing.lg, marginBottom: spacing.md },
  panel: { padding: spacing.lg, marginBottom: spacing.md },
  panelTitle: { ...typography.h3, marginBottom: spacing.lg },
  panelCopy: { ...typography.bodySm, color: colors.muted, lineHeight: 22 },
  chartContainer: { height: 160, justifyContent: 'flex-end' },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 120, borderBottomWidth: 1, borderBottomColor: colors.divider, paddingHorizontal: 2 },
  activityBar: { width: 8, backgroundColor: colors.brand, borderTopLeftRadius: 4, borderTopRightRadius: 4, opacity: 0.8 },
  chartAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 4 },
  axisText: { fontSize: 10, color: colors.mutedLight, fontWeight: '600' },
  usageItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  usageMain: { flex: 1 },
  usageName: { ...typography.body, fontWeight: '600', marginBottom: 2 },
  categoryBadge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  categoryText: { fontSize: 10, fontWeight: '600' },
  usageTime: { ...typography.bodySm, fontWeight: '600', color: colors.muted },
});
