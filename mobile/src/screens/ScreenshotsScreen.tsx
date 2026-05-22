import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
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
import api, { API_BASE } from '../services/api';
import { AppCard, Avatar, MiniIcon, ScreenShell } from '../components/IosKit';
import { borderRadius, colors, spacing, typography } from '../theme';
import type { CalendarDay, Screenshot, User } from '../types';

const assetUrl = (shot: Screenshot) => {
  const base = API_BASE.replace(/\/api$/, '');
  return `${base}/api/agent/screenshots/${shot.id}`;
};

const toDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dayRange = (date: Date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
};

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const monthMeta = (date: Date) => {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const count = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return { offset: first.getDay(), count };
};

const intensity = (minutes: number) => {
  if (minutes <= 0) return colors.surface2;
  if (minutes < 120) return '#FAD1C8';
  if (minutes < 300) return '#F58E78';
  return colors.brand;
};

export default function ScreenshotsScreen() {
  const navigation = useNavigation<any>();
  const today = new Date();
  const [shots, setShots] = useState<Screenshot[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadCalendar = useCallback(async () => {
    setCalendarLoading(true);
    const result = await api.getCalendarHeatmap(cursor.getFullYear(), cursor.getMonth() + 1, selectedUserId || undefined);
    setCalendarDays(result.ok && Array.isArray(result.data) ? result.data : []);
    setCalendarLoading(false);
  }, [cursor, selectedUserId]);

  const load = useCallback(async () => {
    const range = dayRange(selectedDate);
    const userResult = await api.getUsers();
    const nextUsers = userResult.ok && Array.isArray(userResult.data) ? userResult.data : [];
    setUsers(nextUsers);

    if (selectedUserId) {
      const shotResult = await api.getScreenshots({ userId: selectedUserId, ...range, limit: 80 });
      setShots(shotResult.ok && Array.isArray(shotResult.data) ? shotResult.data : []);
    } else if (nextUsers.length > 0) {
      const allResults = await Promise.all(
        nextUsers.map((user) => api.getScreenshots({ userId: user.id, ...range, limit: 30 }))
      );
      const merged = allResults
        .flatMap((result) => (result.ok && Array.isArray(result.data) ? result.data : []))
        .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
      setShots(merged);
    } else {
      const shotResult = await api.getScreenshots({ ...range, limit: 80 });
      setShots(shotResult.ok && Array.isArray(shotResult.data) ? shotResult.data : []);
    }

    setLoading(false);
    setRefreshing(false);
  }, [selectedDate, selectedUserId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useFocusEffect(useCallback(() => { void loadCalendar(); }, [loadCalendar]));

  const userNameById = useMemo(() => {
    const entries = users.map((user) => [user.id, user.fullName] as const);
    return new Map(entries);
  }, [users]);

  const displayName = useCallback((shot: Screenshot) => {
    return shot.employeeName?.trim() || userNameById.get(shot.userId) || 'Employee';
  }, [userNameById]);

  const moveDay = (delta: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + delta);
    selectDate(next);
  };

  const selectDate = (date: Date) => {
    setLoading(true);
    setSelectedDate(date);
    setShowCalendar(false);
    if (date.getFullYear() !== cursor.getFullYear() || date.getMonth() !== cursor.getMonth()) {
      setCursor(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  };

  const moveMonth = (delta: number) => {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
    setCursor(next);
  };

  const authHeaders = api.getToken() ? { Authorization: `Bearer ${api.getToken()}` } : undefined;
  const selectedLabel = selectedDate.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const calendarMap = useMemo(() => new Map(calendarDays.map((day) => [new Date(day.date).getDate(), day])), [calendarDays]);
  const meta = monthMeta(cursor);
  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

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
        <Text style={styles.title}>Screenshots</Text>
        <Text style={styles.subtitle}>Pick a date and browse captured screens</Text>

        <AppCard style={styles.dateCard}>
          <TouchableOpacity style={styles.datePickerButton} activeOpacity={0.8} onPress={() => setShowCalendar(true)}>
            <View style={styles.datePickerIcon}>
              <MiniIcon name="calendar" color={colors.brand} size={22} />
            </View>
            <View style={styles.datePickerText}>
              <Text style={styles.dateLabel}>Screenshot date</Text>
              <Text style={styles.selectedDateTitle}>{selectedLabel}</Text>
            </View>
            <MiniIcon name="forward" color={colors.mutedLight} size={18} />
          </TouchableOpacity>
          <View style={styles.quickRow}>
            <TouchableOpacity style={styles.quickButton} onPress={() => moveDay(-1)}><Text style={styles.quickText}>Previous</Text></TouchableOpacity>
            <TouchableOpacity style={styles.quickButton} onPress={() => selectDate(new Date())}><Text style={styles.quickText}>Today</Text></TouchableOpacity>
            <TouchableOpacity style={styles.quickButton} onPress={() => moveDay(1)}><Text style={styles.quickText}>Next</Text></TouchableOpacity>
          </View>
        </AppCard>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <FilterPill label="All" active={!selectedUserId} onPress={() => setSelectedUserId('')} />
          {users.map((user) => (
            <FilterPill key={user.id} label={user.fullName.split(' ')[0]} active={selectedUserId === user.id} onPress={() => setSelectedUserId(user.id)} />
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={styles.loader} />
        ) : shots.length === 0 ? (
          <EmptyState />
        ) : (
          shots.map((shot) => (
            <TouchableOpacity
              key={shot.id}
              activeOpacity={0.82}
              onPress={() => {
                setGalleryIndex(shots.findIndex((item) => item.id === shot.id));
              }}
            >
              <AppCard style={styles.card} noPadding>
                <View style={styles.cardHeader}>
                  <Avatar name={displayName(shot)} size={32} />
                  <View style={styles.headerText}>
                    <Text style={styles.employee}>{displayName(shot)}</Text>
                    <Text style={styles.meta} numberOfLines={1}>{shot.activeApplication || 'Desktop'} {shot.domain ? `- ${shot.domain}` : ''}</Text>
                  </View>
                  <Text style={styles.time}>{new Date(shot.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
                <Image
                  source={{ uri: assetUrl(shot), headers: authHeaders }}
                  resizeMode="cover"
                  style={styles.image}
                />
                <View style={styles.footer}>
                  <MiniIcon name="laptop" color={colors.mutedLight} size={13} />
                  <Text style={styles.windowTitle} numberOfLines={1}>{shot.windowTitle || 'No window title'}</Text>
                </View>
              </AppCard>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <Modal visible={showCalendar} transparent animationType="slide" onRequestClose={() => setShowCalendar(false)}>
        <View style={styles.calendarOverlay}>
          <TouchableOpacity style={styles.calendarBackdrop} activeOpacity={1} onPress={() => setShowCalendar(false)} />
          <View style={styles.calendarSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.monthBar}>
              <TouchableOpacity style={styles.monthButton} onPress={() => moveMonth(-1)}>
                <MiniIcon name="back" color={colors.text} size={18} />
              </TouchableOpacity>
              <View style={styles.monthCenter}>
                <Text style={styles.dateLabel}>Choose screenshot date</Text>
                <Text style={styles.monthTitle}>{monthLabel}</Text>
              </View>
              <TouchableOpacity style={styles.monthButton} onPress={() => moveMonth(1)}>
                <MiniIcon name="forward" color={colors.text} size={18} />
              </TouchableOpacity>
            </View>
            <View style={styles.weekHeader}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((item, index) => (
                <Text key={`${item}-${index}`} style={styles.weekText}>{item}</Text>
              ))}
            </View>
            {calendarLoading ? (
              <ActivityIndicator color={colors.brand} style={styles.calendarLoader} />
            ) : (
              <View style={styles.calendarGrid}>
                {Array.from({ length: meta.offset }).map((_, index) => <View key={`empty-${index}`} style={styles.dayCell} />)}
                {Array.from({ length: meta.count }).map((_, index) => {
                  const dayNumber = index + 1;
                  const item = calendarMap.get(dayNumber);
                  const minutes = item?.activeMinutes || 0;
                  const isSelected =
                    selectedDate.getFullYear() === cursor.getFullYear() &&
                    selectedDate.getMonth() === cursor.getMonth() &&
                    selectedDate.getDate() === dayNumber;
                  return (
                    <TouchableOpacity
                      key={dayNumber}
                      activeOpacity={0.75}
                      onPress={() => selectDate(new Date(cursor.getFullYear(), cursor.getMonth(), dayNumber))}
                      style={[styles.dayCell, { backgroundColor: intensity(minutes) }, isSelected && styles.selectedDayCell]}
                    >
                      <Text style={[styles.dayText, minutes >= 300 && styles.dayTextActive]}>{dayNumber}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={galleryIndex !== null} transparent animationType="fade" onRequestClose={() => setGalleryIndex(null)}>
        <View style={styles.galleryShell}>
          <View style={styles.galleryTopBar}>
            <View>
              <Text style={styles.galleryTitle}>
                {galleryIndex !== null && shots[galleryIndex] ? displayName(shots[galleryIndex]) : 'Screenshot'}
              </Text>
              <Text style={styles.galleryMeta}>
                {galleryIndex !== null && shots[galleryIndex]
                  ? `${galleryIndex + 1}/${shots.length} - ${new Date(shots[galleryIndex].capturedAt).toLocaleString()}`
                  : ''}
              </Text>
            </View>
            <TouchableOpacity style={styles.galleryClose} onPress={() => setGalleryIndex(null)}>
              <MiniIcon name="close" color={colors.white} size={24} />
            </TouchableOpacity>
          </View>

          {galleryIndex !== null ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: galleryIndex * screenWidth, y: 0 }}
              onMomentumScrollEnd={(event) => {
                const nextIndex = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
                setGalleryIndex(nextIndex);
              }}
            >
              {shots.map((shot) => (
                <View key={shot.id} style={styles.galleryPage}>
                  <ScrollView
                    style={styles.zoomScroll}
                    contentContainerStyle={styles.zoomContent}
                    maximumZoomScale={4}
                    minimumZoomScale={1}
                    pinchGestureEnabled
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={false}
                    centerContent
                  >
                    <Image
                      source={{ uri: assetUrl(shot), headers: authHeaders }}
                      resizeMode="contain"
                      style={styles.galleryImage}
                    />
                  </ScrollView>
                  <View style={styles.galleryCaption}>
                    <Text style={styles.galleryCaptionTitle}>{shot.activeApplication || 'Desktop'}</Text>
                    <Text style={styles.galleryCaptionText} numberOfLines={2}>{shot.windowTitle || 'No window title'}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : null}

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

function EmptyState() {
  return (
    <AppCard style={styles.empty}>
      <MiniIcon name="image" size={42} color={colors.mutedLight} />
      <Text style={styles.emptyText}>No screenshots found for this range.</Text>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.md, marginLeft: -4 },
  backText: { ...typography.bodySm, color: colors.brand, fontWeight: '600' },
  title: { ...typography.h1, marginBottom: 4 },
  subtitle: { ...typography.bodySm, color: colors.muted, marginBottom: spacing.lg },
  dateCard: { padding: spacing.md, marginBottom: spacing.lg },
  datePickerButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  datePickerIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  datePickerText: { flex: 1 },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  monthButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  monthCenter: { alignItems: 'center' },
  dateLabel: { ...typography.label },
  selectedDateTitle: { ...typography.h3, marginTop: 2 },
  monthTitle: { ...typography.h3, marginTop: 2 },
  weekHeader: { flexDirection: 'row', marginBottom: spacing.sm },
  weekText: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, color: colors.muted, fontWeight: '600' },
  calendarLoader: { marginVertical: spacing.lg },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  dayCell: { width: '13.1%', aspectRatio: 1, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  selectedDayCell: { borderWidth: 2, borderColor: colors.text },
  dayText: { fontSize: 12, color: colors.text, fontWeight: '600' },
  dayTextActive: { color: colors.white },
  quickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  quickButton: { flex: 1, backgroundColor: colors.surface2, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  quickText: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  calendarOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.28)' },
  calendarBackdrop: { ...StyleSheet.absoluteFillObject },
  calendarSheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 34 },
  sheetHandle: { width: 42, height: 5, borderRadius: 99, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  filterRow: { gap: spacing.sm, paddingBottom: spacing.lg },
  filterPill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filterPillActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterText: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  filterTextActive: { color: colors.white },
  loader: { marginTop: spacing.xl },
  card: { marginBottom: spacing.md, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  headerText: { flex: 1 },
  employee: { ...typography.bodySm, fontWeight: '600' },
  meta: { ...typography.caption },
  time: { ...typography.small, fontWeight: '600' },
  image: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.surface2 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: spacing.md },
  windowTitle: { flex: 1, ...typography.caption },
  empty: { alignItems: 'center', padding: spacing.xxl, gap: spacing.md, backgroundColor: colors.surface2 },
  emptyText: { ...typography.bodySm, color: colors.muted, textAlign: 'center' },
  galleryShell: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  galleryTopBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, paddingTop: 48, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  galleryTitle: { color: colors.white, fontSize: 16, fontWeight: '600' },
  galleryMeta: { color: 'rgba(255,255,255,0.68)', fontSize: 12, marginTop: 2 },
  galleryClose: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  galleryPage: { width: screenWidth, minHeight: screenHeight, justifyContent: 'center', paddingTop: 96, paddingBottom: 112 },
  zoomScroll: { width: screenWidth, height: screenHeight - 230 },
  zoomContent: { minWidth: screenWidth, minHeight: screenHeight - 230, alignItems: 'center', justifyContent: 'center' },
  galleryImage: { width: screenWidth, height: screenHeight - 230 },
  galleryCaption: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: 34, padding: spacing.md, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)' },
  galleryCaptionTitle: { color: colors.white, fontSize: 14, fontWeight: '600', marginBottom: 3 },
  galleryCaptionText: { color: 'rgba(255,255,255,0.74)', fontSize: 12 },
});
