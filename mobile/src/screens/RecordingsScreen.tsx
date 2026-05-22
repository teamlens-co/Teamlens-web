import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import api, { API_BASE } from '../services/api';
import { AppCard, Avatar, MiniIcon, ScreenShell } from '../components/IosKit';
import { colors, spacing, typography } from '../theme';
import type { Recording } from '../types';

const duration = (recording: Recording) => {
  const seconds = recording.durationSeconds ?? recording.duration ?? 0;
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}h`;
  if (seconds >= 60) return `${Math.round(seconds / 60)}m`;
  return `${seconds}s`;
};

const recordingUrl = (recording: Recording) => {
  const value = recording.url || recording.filePath || `/api/web/recordings/${recording.id}/file`;
  if (value.startsWith('http')) return value;
  return `${API_BASE.replace('/api', '')}${value.startsWith('/') ? value : `/${value}`}`;
};

export default function RecordingsScreen() {
  const navigation = useNavigation<any>();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const result = await api.getRecordings();
    setRecordings(result.ok && Array.isArray(result.data) ? result.data : []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const openRecording = async (recording: Recording) => {
    const url = recordingUrl(recording);
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('Cannot open recording', url);
      return;
    }
    await Linking.openURL(url);
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
        <Text style={styles.title}>Screen Recordings</Text>
        <Text style={styles.subtitle}>Review saved employee screen sessions</Text>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={styles.loader} />
        ) : recordings.length === 0 ? (
          <AppCard style={styles.empty}>
            <MiniIcon name="camera" size={42} color={colors.mutedLight} />
            <Text style={styles.emptyText}>No recordings uploaded yet.</Text>
          </AppCard>
        ) : (
          recordings.map((recording) => (
            <TouchableOpacity key={recording.id} activeOpacity={0.78} onPress={() => openRecording(recording)}>
              <AppCard style={styles.card}>
                <View style={styles.playIcon}><MiniIcon name="play" color={colors.white} size={22} /></View>
                <View style={styles.info}>
                  <Text style={styles.name}>{recording.employeeName || 'Employee recording'}</Text>
                  <Text style={styles.meta}>
                    {recording.createdAt || recording.capturedAt || recording.startedAt
                      ? new Date(recording.createdAt || recording.capturedAt || recording.startedAt || '').toLocaleString()
                      : 'Recent capture'}
                  </Text>
                </View>
                <View style={styles.durationPill}>
                  <Text style={styles.durationText}>{duration(recording)}</Text>
                </View>
              </AppCard>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.md, marginLeft: -4 },
  backText: { ...typography.bodySm, color: colors.brand, fontWeight: '600' },
  title: { ...typography.h1, marginBottom: 4 },
  subtitle: { ...typography.bodySm, color: colors.muted, marginBottom: spacing.lg },
  loader: { marginTop: spacing.xl },
  empty: { alignItems: 'center', padding: spacing.xxl, gap: spacing.md, backgroundColor: colors.surface2 },
  emptyText: { ...typography.bodySm, color: colors.muted },
  card: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md, marginBottom: spacing.sm },
  playIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  name: { ...typography.body, fontWeight: '600' },
  meta: { ...typography.caption, marginTop: 2 },
  durationPill: { backgroundColor: colors.surface2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  durationText: { fontSize: 12, fontWeight: '600', color: colors.muted },
});
