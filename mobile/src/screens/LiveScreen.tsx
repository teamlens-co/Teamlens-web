import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity, Image, Dimensions,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import api, { API_BASE } from '../services/api';
import { colors, borderRadius, spacing, shadow, typography } from '../theme';
import { AppCard, ScreenShell, MiniIcon, Avatar } from '../components/IosKit';
import type { Screenshot } from '../types';

const { width } = Dimensions.get('window');

export default function LiveScreen() {
  const navigation = useNavigation<any>();
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const result = await api.getScreenshots();
    if (result.ok && Array.isArray(result.data)) {
      setScreenshots(result.data);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => {
    fetchData();
    // Poll every 30 seconds for live updates
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]));

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MiniIcon name="back" size={24} color={colors.brand} />
          <Text style={styles.backText}>Home</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Live Screen View</Text>
        <Text style={styles.subtitle}>Real-time employee monitor</Text>

        {screenshots.length === 0 ? (
          <AppCard style={styles.emptyCard}>
            <MiniIcon name="camera" size={40} color={colors.mutedLight} />
            <Text style={styles.emptyText}>No live screenshots available yet.</Text>
          </AppCard>
        ) : (
          <View style={styles.grid}>
            {screenshots.map((shot) => (
              <AppCard key={shot.id} style={styles.shotCard} noPadding>
                <View style={styles.shotHeader}>
                  <Avatar name={shot.employeeName || 'User'} size={24} />
                  <View style={styles.shotMeta}>
                    <Text style={styles.shotUser}>{shot.employeeName || 'Unknown'}</Text>
                    <Text style={styles.shotApp} numberOfLines={1}>
                      {shot.activeApplication || 'Desktop'}
                    </Text>
                  </View>
                  <View style={styles.liveBadge}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>LIVE</Text>
                  </View>
                </View>
                
                <Image
                  source={{ uri: shot.url.startsWith('http') ? shot.url : `${API_BASE.replace('/api', '')}${shot.url}` }}
                  style={styles.screenshot}
                  resizeMode="cover"
                />
                
                <View style={styles.shotFooter}>
                  <MiniIcon name="clock" size={10} color={colors.mutedLight} />
                  <Text style={styles.shotTime}>
                    {new Date(shot.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </AppCard>
            ))}
          </View>
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
  grid: { gap: spacing.md },
  shotCard: {
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  shotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    gap: spacing.sm,
  },
  shotMeta: { flex: 1 },
  shotUser: { fontSize: 13, fontWeight: '700', color: colors.text },
  shotApp: { fontSize: 11, color: colors.muted },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerTint,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  liveDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.danger },
  liveText: { fontSize: 9, fontWeight: '800', color: colors.danger },
  screenshot: {
    width: '100%',
    height: width * 0.56, // 16:9 approx
    backgroundColor: colors.surface2,
  },
  shotFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    gap: 4,
  },
  shotTime: { fontSize: 10, color: colors.mutedLight, fontWeight: '600' },
});
