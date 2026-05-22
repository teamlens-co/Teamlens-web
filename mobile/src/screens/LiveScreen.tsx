import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import api, { API_BASE, WEB_API_BASE, WEB_BASE, WEB_WS_BASE } from '../services/api';
import { AppCard, Avatar, MiniIcon, ScreenShell } from '../components/IosKit';
import { colors, spacing, typography } from '../theme';
import type { ActivityEntry, Screenshot, User } from '../types';

const { width } = Dimensions.get('window');

type LiveEmployee = {
  user: User;
  screenshot: Screenshot | null;
  lastActiveAt: string | null;
  activeApp: string;
};

const todayRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return { startDate: start.toISOString(), endDate: now.toISOString() };
};

const imageUrl = (shot: Screenshot) => `${API_BASE.replace(/\/api$/, '')}/api/agent/screenshots/${shot.id}`;

const isFresh = (value?: string | null) => {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && Date.now() - time <= 10 * 60 * 1000;
};

const relativeTime = (value?: string | null) => {
  if (!value) return 'No activity';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
};

const normalizeTimeline = (payload: unknown) => {
  const data = payload as { employees?: Array<{ userId: string; employeeName?: string; lastActiveAt?: string | null; topApps?: Array<{ name: string }> }> };
  if (Array.isArray(data?.employees)) return data.employees;
  if (Array.isArray(payload)) {
    return (payload as ActivityEntry[]).map((item) => ({
      userId: item.id?.split('-')[0] || '',
      lastActiveAt: item.timestamp,
      topApps: [{ name: item.application }],
    }));
  }
  return [];
};

export default function LiveScreen() {
  const navigation = useNavigation<any>();
  const [employees, setEmployees] = useState<LiveEmployee[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [streamViewerOpen, setStreamViewerOpen] = useState(false);
  const [streamEmployeeId, setStreamEmployeeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const range = todayRange();
    setLastError(null);

    const [usersResult, timelineResult] = await Promise.all([
      api.getUsers(),
      api.getActivityTimeline(range.startDate, range.endDate),
    ]);

    const users = usersResult.ok && Array.isArray(usersResult.data) ? usersResult.data : [];
    if (!usersResult.ok) {
      setLastError(usersResult.message || 'Unable to fetch users.');
    }

    const timelineRows = normalizeTimeline(timelineResult.data);
    const timelineByUser = new Map<string, (typeof timelineRows)[number]>(
      timelineRows
        .filter((item) => Boolean(item.userId))
        .map((item) => [item.userId, item] as const)
    );

    const targetUsers = selectedUserId ? users.filter((user) => user.id === selectedUserId) : users;
    const screenshotResults = await Promise.all(
      targetUsers.map(async (user) => {
        const result = await api.getScreenshots({ userId: user.id, ...range, limit: 1 });
        return [user.id, result.ok && Array.isArray(result.data) ? result.data[0] ?? null : null] as const;
      })
    );
    const screenshotByUser = new Map(screenshotResults);

    setEmployees(
      targetUsers.map((user) => {
        const activity = timelineByUser.get(user.id);
        const screenshot = screenshotByUser.get(user.id) ?? null;
        return {
          user,
          screenshot,
          lastActiveAt: activity?.lastActiveAt ?? screenshot?.capturedAt ?? null,
          activeApp: activity?.topApps?.[0]?.name ?? screenshot?.activeApplication ?? 'No active app',
        };
      })
    );
    setLoading(false);
    setRefreshing(false);
  }, [selectedUserId]);

  useFocusEffect(useCallback(() => {
    void load();
    const interval = setInterval(() => void load(), 30000);
    return () => clearInterval(interval);
  }, [load]));

  const users = useMemo(() => employees.map((item) => item.user), [employees]);
  const authHeaders = api.getToken() ? { Authorization: `Bearer ${api.getToken()}` } : undefined;
  const token = api.getToken() || '';
  const onlineCount = employees.filter((employee) => isFresh(employee.lastActiveAt)).length;
  const liveDashboardUrl = `${WEB_BASE}/mobile-live?${new URLSearchParams({
    ...(token ? { mobileToken: token } : {}),
    ...(streamEmployeeId ? { employeeId: streamEmployeeId } : {}),
    mobileApiBase: WEB_API_BASE,
    mobileWsBase: WEB_WS_BASE,
  }).toString()}`;
  const injectedAuth = `
    try {
      window.localStorage.setItem('teamlens_access_token', ${JSON.stringify(token)});
    } catch (e) {}
    true;
  `;

  const onRefresh = () => {
    setRefreshing(true);
    void load();
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

        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Live View</Text>
            <Text style={styles.subtitle}>{onlineCount} active today - refreshes every 30s</Text>
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
            <MiniIcon name="play" color={colors.brand} size={20} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.streamButton} activeOpacity={0.84} onPress={() => setStreamViewerOpen(true)}>
          <View style={styles.streamIcon}>
            <MiniIcon name="eye" color={colors.white} size={22} />
          </View>
          <View style={styles.streamTextBlock}>
            <Text style={styles.streamTitle}>Open real live stream</Text>
            <Text style={styles.streamSubtitle}>Uses web WebRTC viewer inside mobile</Text>
          </View>
          <MiniIcon name="forward" color={colors.white} size={18} />
        </TouchableOpacity>

        {lastError ? (
          <AppCard style={styles.errorCard}>
            <Text style={styles.errorText}>{lastError}</Text>
          </AppCard>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <FilterPill label="All" active={!selectedUserId} onPress={() => setSelectedUserId('')} />
          {users.map((user) => (
            <FilterPill key={user.id} label={user.fullName.split(' ')[0]} active={selectedUserId === user.id} onPress={() => setSelectedUserId(user.id)} />
          ))}
        </ScrollView>

        {employees.length === 0 ? (
          <AppCard style={styles.emptyCard}>
            <MiniIcon name="camera" size={40} color={colors.mutedLight} />
            <Text style={styles.emptyText}>No employees or live screenshots found.</Text>
          </AppCard>
        ) : (
          <View style={styles.grid}>
            {employees.map((employee) => {
              const live = isFresh(employee.lastActiveAt);
              return (
                <TouchableOpacity
                  key={employee.user.id}
                  activeOpacity={0.82}
                  onPress={() => {
                    setStreamEmployeeId(employee.user.id);
                    setStreamViewerOpen(true);
                  }}
                  onLongPress={() => setViewerIndex(employees.findIndex((item) => item.user.id === employee.user.id))}
                >
                  <AppCard style={styles.shotCard} noPadding>
                    <View style={styles.shotHeader}>
                      <Avatar name={employee.user.fullName} size={30} online={live} />
                      <View style={styles.shotMeta}>
                        <Text style={styles.shotUser}>{employee.user.fullName}</Text>
                        <Text style={styles.shotApp} numberOfLines={1}>{employee.activeApp}</Text>
                      </View>
                      <View style={[styles.liveBadge, !live && styles.idleBadge]}>
                        <View style={[styles.liveDot, !live && styles.idleDot]} />
                        <Text style={[styles.liveText, !live && styles.idleText]}>{live ? 'LIVE' : 'IDLE'}</Text>
                      </View>
                    </View>

                    {employee.screenshot ? (
                      <Image
                        source={{ uri: imageUrl(employee.screenshot), headers: authHeaders }}
                        style={styles.screenshot}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.noScreen}>
                        <MiniIcon name="laptop" size={34} color={colors.mutedLight} />
                        <Text style={styles.noScreenText}>No screenshot today</Text>
                      </View>
                    )}

                    <View style={styles.shotFooter}>
                      <MiniIcon name="eye" size={12} color={colors.brand} />
                      <Text style={styles.openHint}>Tap for stream</Text>
                      <View style={styles.footerSpacer} />
                      <MiniIcon name="clock" size={10} color={colors.mutedLight} />
                      <Text style={styles.shotTime}>{employee.screenshot ? new Date(employee.screenshot.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : relativeTime(employee.lastActiveAt)}</Text>
                    </View>
                  </AppCard>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal visible={viewerIndex !== null} transparent animationType="fade" onRequestClose={() => setViewerIndex(null)}>
        <View style={styles.viewerShell}>
          <View style={styles.viewerTopBar}>
            <View style={styles.viewerTitleBlock}>
              <Text style={styles.viewerTitle}>
                {viewerIndex !== null && employees[viewerIndex] ? employees[viewerIndex].user.fullName : 'Live screen'}
              </Text>
              <Text style={styles.viewerMeta}>
                {viewerIndex !== null && employees[viewerIndex]
                  ? `${viewerIndex + 1}/${employees.length} - ${employees[viewerIndex].activeApp}`
                  : ''}
              </Text>
            </View>
            <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerIndex(null)}>
              <MiniIcon name="close" color={colors.white} size={24} />
            </TouchableOpacity>
          </View>

          {viewerIndex !== null ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: viewerIndex * width, y: 0 }}
              onMomentumScrollEnd={(event) => {
                const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
                setViewerIndex(nextIndex);
              }}
            >
              {employees.map((employee) => {
                const live = isFresh(employee.lastActiveAt);
                return (
                  <View key={employee.user.id} style={styles.viewerPage}>
                    {employee.screenshot ? (
                      <ScrollView
                        style={styles.zoomScroll}
                        contentContainerStyle={styles.zoomContent}
                        maximumZoomScale={4}
                        minimumZoomScale={1}
                        pinchGestureEnabled
                        centerContent
                        showsHorizontalScrollIndicator={false}
                        showsVerticalScrollIndicator={false}
                      >
                        <Image
                          source={{ uri: imageUrl(employee.screenshot), headers: authHeaders }}
                          style={styles.viewerImage}
                          resizeMode="contain"
                        />
                      </ScrollView>
                    ) : (
                      <View style={styles.viewerEmpty}>
                        <MiniIcon name="laptop" size={52} color="rgba(255,255,255,0.45)" />
                        <Text style={styles.viewerEmptyText}>No screenshot available for {employee.user.fullName}</Text>
                      </View>
                    )}
                    <View style={styles.viewerCaption}>
                      <View style={[styles.liveBadge, !live && styles.idleBadge]}>
                        <View style={[styles.liveDot, !live && styles.idleDot]} />
                        <Text style={[styles.liveText, !live && styles.idleText]}>{live ? 'LIVE' : 'IDLE'}</Text>
                      </View>
                      <View style={styles.viewerCaptionText}>
                        <Text style={styles.viewerCaptionTitle}>{employee.activeApp}</Text>
                        <Text style={styles.viewerCaptionSub}>
                          {employee.screenshot?.windowTitle || relativeTime(employee.lastActiveAt)}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          ) : null}
        </View>
      </Modal>

      <Modal visible={streamViewerOpen} animationType="slide" onRequestClose={() => setStreamViewerOpen(false)}>
        <View style={styles.webShell}>
          <View style={styles.webHeader}>
            <View>
              <Text style={styles.webTitle}>Real Live Stream</Text>
              <Text style={styles.webMeta}>{liveDashboardUrl}</Text>
            </View>
            <TouchableOpacity style={styles.webClose} onPress={() => setStreamViewerOpen(false)}>
              <MiniIcon name="close" color={colors.white} size={22} />
            </TouchableOpacity>
          </View>
          <WebView
            source={{ uri: liveDashboardUrl }}
            style={styles.webView}
            injectedJavaScriptBeforeContentLoaded={injectedAuth}
            injectedJavaScript={injectedAuth}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.webLoading}>
                <ActivityIndicator color={colors.brand} size="large" />
                <Text style={styles.webLoadingText}>Opening live stream...</Text>
              </View>
            )}
          />
        </View>
      </Modal>
    </ScreenShell>
  );
}

function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.filterPill, active && styles.filterPillActive]}>
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  content: { paddingBottom: spacing.xxl },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.lg, marginLeft: -4 },
  backText: { ...typography.body, color: colors.brand, fontWeight: '600' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  title: { ...typography.h1, marginBottom: 4 },
  subtitle: { ...typography.bodySm, color: colors.muted },
  refreshButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  streamButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.text, borderRadius: 18, padding: spacing.md, marginBottom: spacing.lg },
  streamIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  streamTextBlock: { flex: 1 },
  streamTitle: { color: colors.white, fontSize: 15, fontWeight: '600' },
  streamSubtitle: { color: 'rgba(255,255,255,0.66)', fontSize: 12, marginTop: 2 },
  errorCard: { padding: spacing.md, backgroundColor: colors.dangerTint, borderColor: '#FECACA', marginBottom: spacing.md },
  errorText: { ...typography.bodySm, color: colors.danger, fontWeight: '600' },
  filterRow: { gap: spacing.sm, paddingBottom: spacing.lg },
  filterPill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filterPillActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterText: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  filterTextActive: { color: colors.white },
  emptyCard: { alignItems: 'center', padding: spacing.xxl, gap: spacing.md, backgroundColor: colors.surface2 },
  emptyText: { ...typography.bodySm, color: colors.muted, textAlign: 'center' },
  grid: { gap: spacing.md },
  shotCard: { overflow: 'hidden', marginBottom: spacing.sm },
  shotHeader: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, gap: spacing.sm },
  shotMeta: { flex: 1 },
  shotUser: { fontSize: 13, fontWeight: '600', color: colors.text },
  shotApp: { fontSize: 11, color: colors.muted },
  liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.dangerTint, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, gap: 4 },
  idleBadge: { backgroundColor: colors.surface2 },
  liveDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.danger },
  idleDot: { backgroundColor: colors.mutedLight },
  liveText: { fontSize: 9, fontWeight: '600', color: colors.danger },
  idleText: { color: colors.muted },
  screenshot: { width: '100%', height: width * 0.56, backgroundColor: colors.surface2 },
  noScreen: { width: '100%', height: width * 0.56, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  noScreenText: { ...typography.caption, fontWeight: '600' },
  shotFooter: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, gap: 4 },
  openHint: { fontSize: 10, color: colors.brand, fontWeight: '600' },
  footerSpacer: { flex: 1 },
  shotTime: { fontSize: 10, color: colors.mutedLight, fontWeight: '600' },
  viewerShell: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  viewerTopBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, paddingTop: 48, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.35)' },
  viewerTitleBlock: { flex: 1, paddingRight: spacing.md },
  viewerTitle: { color: colors.white, fontSize: 16, fontWeight: '600' },
  viewerMeta: { color: 'rgba(255,255,255,0.68)', fontSize: 12, marginTop: 2 },
  viewerClose: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  viewerPage: { width, minHeight: Dimensions.get('window').height, justifyContent: 'center', paddingTop: 96, paddingBottom: 112 },
  zoomScroll: { width, height: Dimensions.get('window').height - 230 },
  zoomContent: { minWidth: width, minHeight: Dimensions.get('window').height - 230, alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width, height: Dimensions.get('window').height - 230 },
  viewerEmpty: { width, height: Dimensions.get('window').height - 230, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  viewerEmptyText: { color: 'rgba(255,255,255,0.68)', fontSize: 14, fontWeight: '600', textAlign: 'center', paddingHorizontal: spacing.xl },
  viewerCaption: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: 34, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)' },
  viewerCaptionText: { flex: 1 },
  viewerCaptionTitle: { color: colors.white, fontSize: 14, fontWeight: '600' },
  viewerCaptionSub: { color: 'rgba(255,255,255,0.74)', fontSize: 12, marginTop: 2 },
  webShell: { flex: 1, backgroundColor: colors.bg },
  webHeader: { paddingTop: 48, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.text, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  webTitle: { color: colors.white, fontSize: 16, fontWeight: '600' },
  webMeta: { color: 'rgba(255,255,255,0.62)', fontSize: 11, marginTop: 2, maxWidth: 260 },
  webClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  webView: { flex: 1, backgroundColor: colors.bg },
  webLoading: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  webLoadingText: { ...typography.bodySm, color: colors.muted, marginTop: spacing.md, fontWeight: '600' },
});
