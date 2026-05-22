import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import api from '../services/api';
import { AppCard, MiniIcon, ScreenShell } from '../components/IosKit';
import { borderRadius, colors, spacing, typography } from '../theme';
import type { CalendarDay, DashboardAnalytics, Screenshot } from '../types';

const padDays = (year: number, month: number) => {
  const first = new Date(year, month, 1);
  const count = new Date(year, month + 1, 0).getDate();
  return { offset: first.getDay(), count };
};

const intensity = (minutes: number) => {
  if (minutes <= 0) return colors.surface2;
  if (minutes < 120) return '#FAD1C8';
  if (minutes < 300) return '#F58E78';
  return colors.brand;
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
  return { start: start.toISOString(), end: end.toISOString() };
};

const parseDateInput = (value: string) => {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const formatHours = (seconds?: number, minutes?: number) => {
  const totalSeconds = seconds ?? (minutes ?? 0) * 60;
  return `${(totalSeconds / 3600).toFixed(1)}h`;
};

export default function CalendarScreen() {
  const navigation = useNavigation<any>();
  const now = new Date();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const [dateQuery, setDateQuery] = useState(toDateInput(now));
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [dayAnalytics, setDayAnalytics] = useState<DashboardAnalytics | null>(null);
  const [dayScreenshots, setDayScreenshots] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const result = await api.getCalendarHeatmap(cursor.getFullYear(), cursor.getMonth() + 1);
    setDays(result.ok && Array.isArray(result.data) ? result.data : []);
    setLoading(false);
    setRefreshing(false);
  }, [cursor]);

  const loadSelectedDate = useCallback(async () => {
    setDetailLoading(true);
    const range = dayRange(selectedDate);
    const [analyticsResult, screenshotsResult] = await Promise.all([
      api.getDashboardAnalytics(range.start, range.end),
      api.getScreenshots({ startDate: range.start, endDate: range.end, limit: 8 }),
    ]);
    setDayAnalytics(analyticsResult.ok ? analyticsResult.data ?? null : null);
    setDayScreenshots(screenshotsResult.ok && Array.isArray(screenshotsResult.data) ? screenshotsResult.data : []);
    setDetailLoading(false);
  }, [selectedDate]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useFocusEffect(useCallback(() => { void loadSelectedDate(); }, [loadSelectedDate]));

  const dayMap = useMemo(() => new Map(days.map((day) => [new Date(day.date).getDate(), day])), [days]);
  const meta = padDays(cursor.getFullYear(), cursor.getMonth());
  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const totalMinutes = days.reduce((sum, day) => sum + (day.activeMinutes || 0), 0);

  const moveMonth = (delta: number) => {
    setLoading(true);
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  };

  const selectDate = (date: Date) => {
    setSelectedDate(date);
    setDateQuery(toDateInput(date));
    if (date.getFullYear() !== cursor.getFullYear() || date.getMonth() !== cursor.getMonth()) {
      setCursor(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  };

  const searchDate = () => {
    const parsed = parseDateInput(dateQuery);
    if (!parsed) {
      Alert.alert('Invalid date', 'Date format YYYY-MM-DD mein daalo. Example: 2026-05-21');
      return;
    }
    selectDate(parsed);
  };

  const moveDay = (delta: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + delta);
    selectDate(next);
  };

  const selectedDayItem = dayMap.get(selectedDate.getDate());
  const selectedLabel = selectedDate.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

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
        <Text style={styles.title}>Calendar</Text>
        <Text style={styles.subtitle}>Search any date and open that day&apos;s work data</Text>

        <AppCard style={styles.searchCard}>
          <Text style={styles.searchLabel}>Find date</Text>
          <View style={styles.searchRow}>
            <TextInput
              value={dateQuery}
              onChangeText={setDateQuery}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.mutedLight}
              keyboardType="numbers-and-punctuation"
              style={styles.dateInput}
            />
            <TouchableOpacity style={styles.searchButton} onPress={searchDate}>
              <MiniIcon name="search" color={colors.white} size={19} />
            </TouchableOpacity>
          </View>
          <View style={styles.quickRow}>
            <TouchableOpacity style={styles.quickButton} onPress={() => moveDay(-1)}><Text style={styles.quickText}>Previous day</Text></TouchableOpacity>
            <TouchableOpacity style={styles.quickButton} onPress={() => selectDate(new Date())}><Text style={styles.quickText}>Today</Text></TouchableOpacity>
            <TouchableOpacity style={styles.quickButton} onPress={() => moveDay(1)}><Text style={styles.quickText}>Next day</Text></TouchableOpacity>
          </View>
        </AppCard>

        <View style={styles.monthBar}>
          <TouchableOpacity style={styles.navButton} onPress={() => moveMonth(-1)}><MiniIcon name="back" color={colors.text} /></TouchableOpacity>
          <Text style={styles.month}>{monthLabel}</Text>
          <TouchableOpacity style={styles.navButton} onPress={() => moveMonth(1)}><MiniIcon name="forward" color={colors.text} /></TouchableOpacity>
        </View>

        <AppCard style={styles.summary}>
          <Text style={styles.summaryLabel}>Tracked this month</Text>
          <Text style={styles.summaryValue}>{(totalMinutes / 60).toFixed(1)}h</Text>
        </AppCard>

        <AppCard style={styles.calendar}>
          <View style={styles.weekHeader}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((item, index) => <Text key={`${item}-${index}`} style={styles.weekText}>{item}</Text>)}
          </View>
          {loading ? (
            <ActivityIndicator color={colors.brand} style={styles.loader} />
          ) : (
            <View style={styles.grid}>
              {Array.from({ length: meta.offset }).map((_, index) => <View key={`empty-${index}`} style={styles.dayCell} />)}
              {Array.from({ length: meta.count }).map((_, index) => {
                const dayNumber = index + 1;
                const item = dayMap.get(dayNumber);
                const minutes = item?.activeMinutes || 0;
                return (
                  <TouchableOpacity
                    key={dayNumber}
                    activeOpacity={0.75}
                    onPress={() => selectDate(new Date(cursor.getFullYear(), cursor.getMonth(), dayNumber))}
                    style={[
                      styles.dayCell,
                      { backgroundColor: intensity(minutes) },
                      selectedDate.getFullYear() === cursor.getFullYear() &&
                      selectedDate.getMonth() === cursor.getMonth() &&
                      selectedDate.getDate() === dayNumber &&
                      styles.selectedDayCell,
                    ]}
                  >
                    <Text style={[styles.dayText, minutes >= 300 && styles.dayTextActive]}>{dayNumber}</Text>
                    {minutes ? <Text style={[styles.minuteText, minutes >= 300 && styles.dayTextActive]}>{Math.round(minutes / 60)}h</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </AppCard>

        <AppCard style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <View>
              <Text style={styles.detailLabel}>Selected date</Text>
              <Text style={styles.detailTitle}>{selectedLabel}</Text>
            </View>
            {detailLoading ? <ActivityIndicator color={colors.brand} /> : null}
          </View>
          <View style={styles.detailGrid}>
            <DetailStat label="Active" value={formatHours(dayAnalytics?.activeSeconds, dayAnalytics?.totalActiveMinutes ?? selectedDayItem?.activeMinutes)} color={colors.brand} />
            <DetailStat label="Productivity" value={`${Math.round(dayAnalytics?.productivityPercent ?? dayAnalytics?.activePercentage ?? 0)}%`} color={colors.success} />
            <DetailStat label="Sessions" value={String(dayAnalytics?.sessionCount ?? dayAnalytics?.sessions?.length ?? 0)} color={colors.info} />
            <DetailStat label="Shots" value={String(dayScreenshots.length)} color={colors.warning} />
          </View>
        </AppCard>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Day screenshots</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Screenshots')}>
            <Text style={styles.linkText}>Open all</Text>
          </TouchableOpacity>
        </View>
        {dayScreenshots.length === 0 ? (
          <AppCard style={styles.emptyCard}><Text style={styles.emptyText}>Is date par screenshots nahi mile.</Text></AppCard>
        ) : (
          dayScreenshots.map((shot) => (
            <AppCard key={shot.id} style={styles.shotRow}>
              <View style={styles.shotIcon}><MiniIcon name="image" color={colors.brand} size={18} /></View>
              <View style={styles.shotMain}>
                <Text style={styles.shotTitle}>{shot.employeeName || 'Employee'}</Text>
                <Text style={styles.shotMeta} numberOfLines={1}>{shot.activeApplication || 'Desktop'} - {new Date(shot.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
            </AppCard>
          ))
        )}
      </ScrollView>
    </ScreenShell>
  );
}

function DetailStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.detailStat}>
      <Text style={[styles.detailValue, { color }]}>{value}</Text>
      <Text style={styles.detailStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.md, marginLeft: -4 },
  backText: { ...typography.bodySm, color: colors.brand, fontWeight: '600' },
  title: { ...typography.h1, marginBottom: 4 },
  subtitle: { ...typography.bodySm, color: colors.muted, marginBottom: spacing.lg },
  searchCard: { padding: spacing.md, marginBottom: spacing.md },
  searchLabel: { ...typography.label, marginBottom: spacing.sm },
  searchRow: { flexDirection: 'row', gap: spacing.sm },
  dateInput: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: 11, color: colors.text, fontWeight: '600' },
  searchButton: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  quickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  quickButton: { flex: 1, backgroundColor: colors.surface2, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  quickText: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  navButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  month: { ...typography.h3 },
  summary: { padding: spacing.lg, marginBottom: spacing.md },
  summaryLabel: { ...typography.caption, fontWeight: '600' },
  summaryValue: { fontSize: 32, fontWeight: '600', color: colors.brand, marginTop: 2 },
  calendar: { padding: spacing.md },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  weekText: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 12, color: colors.muted, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  dayCell: { width: '13.1%', aspectRatio: 1, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  selectedDayCell: { borderWidth: 2, borderColor: colors.text },
  dayText: { fontSize: 12, color: colors.text, fontWeight: '600' },
  minuteText: { fontSize: 9, color: colors.muted, fontWeight: '600', marginTop: 1 },
  dayTextActive: { color: colors.white },
  loader: { marginVertical: spacing.xl },
  detailCard: { padding: spacing.md, marginTop: spacing.md, marginBottom: spacing.md },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  detailLabel: { ...typography.caption, fontWeight: '600' },
  detailTitle: { ...typography.h3 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  detailStat: { width: '48%', backgroundColor: colors.surface2, borderRadius: 12, padding: spacing.md },
  detailValue: { fontSize: 22, fontWeight: '600' },
  detailStatLabel: { ...typography.caption, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionTitle: { ...typography.h3 },
  linkText: { ...typography.bodySm, color: colors.brand, fontWeight: '600' },
  emptyCard: { padding: spacing.lg, alignItems: 'center' },
  emptyText: { ...typography.bodySm, color: colors.muted },
  shotRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, marginBottom: spacing.sm },
  shotIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  shotMain: { flex: 1 },
  shotTitle: { ...typography.bodySm, fontWeight: '600' },
  shotMeta: { ...typography.caption },
});
