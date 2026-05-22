import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import api from '../services/api';
import { AppCard, MiniIcon, ScreenShell } from '../components/IosKit';
import { colors, spacing, typography } from '../theme';
import type { ManualTimeRequest } from '../types';

const statusTone = (status: string) => {
  const key = status.toLowerCase();
  if (key === 'approved') return colors.success;
  if (key === 'rejected') return colors.danger;
  return colors.warning;
};

export default function ManualTimeScreen() {
  const navigation = useNavigation<any>();
  const [requests, setRequests] = useState<ManualTimeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.getManualTimeRequests();
    setRequests(result.ok && Array.isArray(result.data) ? result.data : []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const review = async (id: string, status: 'approved' | 'rejected') => {
    setBusyId(id);
    const result = await api.reviewManualTimeRequest(id, status);
    setBusyId(null);
    if (!result.ok) {
      Alert.alert('Unable to update', result.message || 'Please try again.');
      return;
    }
    void load();
  };

  const pending = requests.filter((request) => request.status?.toLowerCase() === 'pending').length;

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
        <Text style={styles.title}>Manual Time</Text>
        <Text style={styles.subtitle}>Review employee time corrections</Text>

        <View style={styles.summaryRow}>
          <Summary label="Pending" value={pending} color={colors.warning} />
          <Summary label="Total" value={requests.length} color={colors.info} />
        </View>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={styles.loader} />
        ) : requests.length === 0 ? (
          <AppCard style={styles.empty}><Text style={styles.emptyText}>No manual time requests right now.</Text></AppCard>
        ) : (
          requests.map((request) => {
            const color = statusTone(request.status);
            const isPending = request.status?.toLowerCase() === 'pending';
            return (
              <AppCard key={request.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.cardMain}>
                    <Text style={styles.name}>{request.fullName || 'Employee'}</Text>
                    <Text style={styles.reason}>{request.reason || 'Manual time adjustment'}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: `${color}18` }]}>
                    <Text style={[styles.badgeText, { color }]}>{request.status}</Text>
                  </View>
                </View>
                <View style={styles.details}>
                  <Detail label="Date" value={new Date(request.date).toLocaleDateString()} />
                  <Detail label="Hours" value={`${request.hours}h`} />
                </View>
                {isPending ? (
                  <View style={styles.actions}>
                    <TouchableOpacity disabled={busyId === request.id} style={[styles.actionButton, styles.reject]} onPress={() => review(request.id, 'rejected')}>
                      <MiniIcon name="close" color={colors.danger} size={18} />
                      <Text style={[styles.actionText, { color: colors.danger }]}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity disabled={busyId === request.id} style={[styles.actionButton, styles.approve]} onPress={() => review(request.id, 'approved')}>
                      <MiniIcon name="check" color={colors.success} size={18} />
                      <Text style={[styles.actionText, { color: colors.success }]}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </AppCard>
            );
          })
        )}
      </ScrollView>
    </ScreenShell>
  );
}

function Summary({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <AppCard style={styles.summary}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </AppCard>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.md, marginLeft: -4 },
  backText: { ...typography.bodySm, color: colors.brand, fontWeight: '600' },
  title: { ...typography.h1, marginBottom: 4 },
  subtitle: { ...typography.bodySm, color: colors.muted, marginBottom: spacing.lg },
  summaryRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  summary: { flex: 1, padding: spacing.md },
  summaryValue: { fontSize: 28, fontWeight: '600' },
  summaryLabel: { ...typography.caption, fontWeight: '600' },
  loader: { marginTop: spacing.xl },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { ...typography.bodySm, color: colors.muted },
  card: { padding: spacing.md, marginBottom: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cardMain: { flex: 1 },
  name: { ...typography.body, fontWeight: '600' },
  reason: { ...typography.bodySm, color: colors.muted, marginTop: 2 },
  badge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  details: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  detailLabel: { ...typography.small },
  detailValue: { ...typography.bodySm, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 12 },
  reject: { backgroundColor: colors.dangerTint },
  approve: { backgroundColor: colors.successTint },
  actionText: { fontWeight: '600' },
});
