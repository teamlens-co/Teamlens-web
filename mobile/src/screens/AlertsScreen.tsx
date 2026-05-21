import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { colors, borderRadius, spacing, shadow, typography } from '../theme';
import { AppCard, ScreenShell, MiniIcon } from '../components/IosKit';
import type { ManualTimeRequest } from '../types';

export default function AlertsScreen() {
  const [requests, setRequests] = useState<ManualTimeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const result = await api.getManualTimeRequests();
    setRequests(result.ok && Array.isArray(result.data) ? result.data : []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const pending = requests.filter((request) => request.status === 'pending');

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
        <Text style={styles.title}>Alerts</Text>
        <Text style={styles.subtitle}>Review queue and manual time requests</Text>

        <View style={styles.summaryRow}>
          <AppCard style={styles.summaryCard}>
            <View style={[styles.summaryIcon, { backgroundColor: colors.warningTint }]}>
              <MiniIcon name="warn" color={colors.warning} size={18} />
            </View>
            <View>
              <Text style={styles.summaryValue}>{pending.length}</Text>
              <Text style={styles.summaryLabel}>Pending</Text>
            </View>
          </AppCard>
          <AppCard style={styles.summaryCard}>
            <View style={[styles.summaryIcon, { backgroundColor: colors.infoTint }]}>
              <MiniIcon name="card-text" color={colors.info} size={18} />
            </View>
            <View>
              <Text style={styles.summaryValue}>{requests.length}</Text>
              <Text style={styles.summaryLabel}>Total</Text>
            </View>
          </AppCard>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Review Queue</Text>
          <TouchableOpacity><Text style={styles.linkText}>History</Text></TouchableOpacity>
        </View>

        {requests.length === 0 ? (
          <AppCard style={styles.emptyCard}>
            <MiniIcon name="shield" size={40} color={colors.mutedLight} />
            <Text style={styles.emptyText}>All clear! No alerts requiring attention.</Text>
          </AppCard>
        ) : (
          requests.map((request) => (
            <AppCard key={request.id} style={styles.rowCard}>
              <View style={[styles.statusIndicator, { backgroundColor: request.status === 'pending' ? colors.warning : colors.success }]} />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{request.fullName || 'Manual Time Entry'}</Text>
                <Text style={styles.rowMeta}>{request.reason || `${request.hours}h requested`}</Text>
                <View style={styles.rowFooter}>
                  <Text style={styles.rowTime}>Requested 2h ago</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.actionButton}>
                <MiniIcon name="forward" size={16} color={colors.brand} />
              </TouchableOpacity>
            </AppCard>
          ))
        )}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  content: { paddingBottom: spacing.xxl },
  title: { ...typography.h1, marginBottom: 4 },
  subtitle: { ...typography.bodySm, color: colors.muted, marginBottom: spacing.lg },
  summaryRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  summaryCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  summaryIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  summaryValue: { ...typography.h3, fontSize: 20 },
  summaryLabel: { ...typography.caption, marginTop: -2 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: { ...typography.h3 },
  linkText: { ...typography.bodySm, color: colors.brand, fontWeight: '600' },
  emptyCard: { alignItems: 'center', padding: spacing.xxl, gap: spacing.md, backgroundColor: colors.surface2 },
  emptyText: { ...typography.bodySm, color: colors.muted, textAlign: 'center' },
  rowCard: { flexDirection: 'row', padding: 0, overflow: 'hidden', marginBottom: spacing.sm },
  statusIndicator: { width: 4, height: '100%' },
  rowBody: { flex: 1, padding: spacing.md },
  rowTitle: { ...typography.body, fontWeight: '700', marginBottom: 2 },
  rowMeta: { ...typography.bodySm, color: colors.muted, marginBottom: 8 },
  rowFooter: { flexDirection: 'row', alignItems: 'center' },
  rowTime: { ...typography.small, opacity: 0.7 },
  actionButton: { padding: spacing.md, justifyContent: 'center' },
});
