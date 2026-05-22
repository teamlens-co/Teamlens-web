import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { colors, borderRadius, shadow, typography } from '../theme';
import type {
  AttendanceCell,
  AttendanceEmployee,
  AttendanceOverview,
  AttendanceStatus,
  TimesheetEntry,
} from '../types';

type Tab = 'timesheets' | 'attendance';

const emptyOverview = (month: Date): AttendanceOverview => ({
  month: month.toISOString().slice(0, 7),
  thresholdMinutes: 180,
  daysInMonth: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(),
  stats: {
    attendedDays: 0,
    currentlyWorking: 0,
    belowThreshold: 0,
    employees: 0,
    officeDays: 0,
    remoteDays: 0,
  },
  employees: [],
  timesheets: [],
});

const monthBounds = (value: Date) => {
  const start = new Date(value.getFullYear(), value.getMonth(), 1);
  const end = new Date(value.getFullYear(), value.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
};

const formatDuration = (seconds?: number) => {
  const total = Math.max(0, Math.round(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m`;
};

const formatHours = (seconds?: number) => {
  const hours = Math.max(0, seconds || 0) / 3600;
  if (hours === 0) return '0h';
  return `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)}h`;
};

const formatClock = (value?: string | null) => {
  if (!value) return '--';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (value: string) => (
  new Date(value).toLocaleDateString([], { day: '2-digit', month: 'short' })
);

const statusMeta = (status: AttendanceStatus) => {
  switch (status) {
    case 'attended':
      return { label: 'Attended', short: 'A', color: colors.brand, tint: colors.brandLight };
    case 'working':
      return { label: 'Working', short: 'W', color: colors.success, tint: colors.successTint };
    case 'below':
      return { label: 'Below', short: 'B', color: colors.warning, tint: colors.warningTint };
    case 'absent':
      return { label: 'Absent', short: 'X', color: colors.danger, tint: colors.dangerTint };
    case 'weekend':
      return { label: 'Weekend', short: 'S', color: colors.mutedLight, tint: colors.surface2 };
    case 'future':
      return { label: 'Future', short: '-', color: colors.mutedLight, tint: colors.surface2 };
    default:
      return { label: 'Unknown', short: '?', color: colors.muted, tint: colors.surface2 };
  }
};

const getInitials = (name: string) => name
  .split(' ')
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join('') || 'TL';

export default function AttendanceScreen() {
  const [month, setMonth] = useState(() => new Date());
  const [overview, setOverview] = useState<AttendanceOverview>(() => emptyOverview(new Date()));
  const [activeTab, setActiveTab] = useState<Tab>('timesheets');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const { start, end } = monthBounds(month);
    const result = await api.getAttendance(start.toISOString(), end.toISOString());

    if (result.ok && result.data) {
      setOverview({
        ...emptyOverview(month),
        ...result.data,
        stats: { ...emptyOverview(month).stats, ...(result.data.stats || {}) },
        employees: Array.isArray(result.data.employees) ? result.data.employees : [],
        timesheets: Array.isArray(result.data.timesheets) ? result.data.timesheets : [],
      });
      setError(null);
    } else {
      setOverview(emptyOverview(month));
      setError(result.message || 'Attendance data load nahi ho paya.');
    }

    setLoading(false);
    setRefreshing(false);
  }, [month]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const absentDays = useMemo(
    () => overview.employees.reduce((sum, employee) => sum + (employee.absentDays || 0), 0),
    [overview.employees]
  );

  const monthLabel = month.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const hasData = overview.timesheets.length > 0 || overview.employees.length > 0;

  const changeMonth = (offset: number) => {
    setLoading(true);
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={colors.brand} />}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Attendance workflow</Text>
          <Text style={styles.title}>Attendance</Text>
        </View>
        <View style={styles.monthStepper}>
          <TouchableOpacity style={styles.stepButton} onPress={() => changeMonth(-1)}>
            <Text style={styles.stepText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.monthText}>{monthLabel}</Text>
          <TouchableOpacity style={styles.stepButton} onPress={() => changeMonth(1)}>
            <Text style={styles.stepText}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.summaryGrid}>
        <SummaryCard label="Attended" value={overview.stats.attendedDays} tone="brand" />
        <SummaryCard label="Currently working" value={overview.stats.currentlyWorking} tone="success" />
        <SummaryCard label="Below threshold" value={overview.stats.belowThreshold} tone="warning" />
        <SummaryCard label="Absent" value={absentDays} tone="danger" />
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>{overview.stats.employees} employees</Text>
        <Text style={styles.metaDot}>•</Text>
        <Text style={styles.metaText}>{overview.thresholdMinutes}m threshold</Text>
        <Text style={styles.metaDot}>•</Text>
        <Text style={styles.metaText}>{overview.stats.officeDays} office / {overview.stats.remoteDays} remote</Text>
      </View>

      <View style={styles.segment}>
        <SegmentButton label="Timesheets" active={activeTab === 'timesheets'} onPress={() => setActiveTab('timesheets')} />
        <SegmentButton label="Attendance" active={activeTab === 'attendance'} onPress={() => setActiveTab('attendance')} />
      </View>

      {!hasData ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No attendance data</Text>
          <Text style={styles.emptyText}>Is month ke liye abhi sessions ya attendance rows available nahi hain.</Text>
        </View>
      ) : activeTab === 'timesheets' ? (
        <View style={styles.listGap}>
          {overview.timesheets.map((entry) => (
            <TimesheetCard key={entry.id} entry={entry} />
          ))}
        </View>
      ) : (
        <View style={styles.listGap}>
          <AttendanceLegend />
          {overview.employees.map((employee) => (
            <EmployeeAttendanceCard key={employee.userId} employee={employee} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: 'brand' | 'success' | 'warning' | 'danger' }) {
  const palette = {
    brand: { color: colors.brand, tint: colors.brandLight },
    success: { color: colors.success, tint: colors.successTint },
    warning: { color: colors.warning, tint: colors.warningTint },
    danger: { color: colors.danger, tint: colors.dangerTint },
  }[tone];

  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIcon, { backgroundColor: palette.tint }]}>
        <View style={[styles.summaryDot, { backgroundColor: palette.color }]} />
      </View>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.segmentButton, active && styles.segmentButtonActive]} onPress={onPress}>
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function TimesheetCard({ entry }: { entry: TimesheetEntry }) {
  const live = Boolean(entry.isCurrentlyWorking || !entry.clockOutAt);
  const meta = live ? statusMeta('working') : entry.workSeconds > 0 ? statusMeta('attended') : statusMeta('absent');

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.personRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(entry.employeeName)}</Text>
          </View>
          <View style={styles.personText}>
            <Text style={styles.name}>{entry.employeeName || 'Unknown employee'}</Text>
            <Text style={styles.subText}>{formatDate(entry.date)} • {entry.teamName || 'No team'}</Text>
          </View>
        </View>
        <View style={[styles.badge, { backgroundColor: meta.tint }]}>
          <Text style={[styles.badgeText, { color: meta.color }]}>{live ? 'Working' : 'Closed'}</Text>
        </View>
      </View>

      <View style={styles.timeGrid}>
        <Metric label="Clock in" value={formatClock(entry.clockInAt)} />
        <Metric label="Clock out" value={formatClock(entry.clockOutAt)} />
        <Metric label="Work time" value={formatDuration(entry.workSeconds)} />
        <Metric label="Active" value={formatDuration(entry.activeSeconds)} />
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>{entry.shiftName || 'General shift'}</Text>
        <Text style={styles.footerText}>{entry.locationStatus || 'Remote/unknown'}</Text>
      </View>
    </View>
  );
}

function EmployeeAttendanceCard({ employee }: { employee: AttendanceEmployee }) {
  const totalMarkedDays = Math.max(
    1,
    employee.attendedDays + employee.workingDays + employee.belowThresholdDays + employee.absentDays
  );
  const workedDays = employee.attendedDays + employee.workingDays;
  const healthPercent = Math.round((workedDays / totalMarkedDays) * 100);

  return (
    <View style={styles.attendanceCard}>
      <View style={styles.attendanceHeader}>
        <View style={styles.personRow}>
          <View style={styles.attendanceAvatar}>
            <Text style={styles.avatarText}>{employee.initials || getInitials(employee.employeeName)}</Text>
          </View>
          <View style={styles.personText}>
            <Text style={styles.name}>{employee.employeeName || 'Unknown employee'}</Text>
            <Text style={styles.subText}>{employee.email || employee.shiftSummary || 'Attendance summary'}</Text>
          </View>
        </View>
        <View style={styles.scorePill}>
          <Text style={styles.scoreValue}>{healthPercent}%</Text>
          <Text style={styles.scoreLabel}>score</Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressChunk, { flex: employee.attendedDays || 0.0001, backgroundColor: colors.brand }]} />
        <View style={[styles.progressChunk, { flex: employee.workingDays || 0.0001, backgroundColor: colors.success }]} />
        <View style={[styles.progressChunk, { flex: employee.belowThresholdDays || 0.0001, backgroundColor: colors.warning }]} />
        <View style={[styles.progressChunk, { flex: employee.absentDays || 0.0001, backgroundColor: colors.danger }]} />
      </View>

      <View style={styles.attendanceStats}>
        <StatusCount status="attended" value={employee.attendedDays} />
        <StatusCount status="working" value={employee.workingDays} />
        <StatusCount status="below" value={employee.belowThresholdDays} />
        <StatusCount status="absent" value={employee.absentDays} />
      </View>

      <View style={styles.calendarHeader}>
        <Text style={styles.calendarTitle}>Month view</Text>
        <Text style={styles.calendarHint}>Swipe days</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRail}>
        {employee.cells.map((cell) => (
          <DayCell key={`${employee.userId}-${cell.date}`} cell={cell} />
        ))}
      </ScrollView>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={[styles.miniValue, { color }]}>{value}</Text>
      <Text style={styles.miniLabel}>{label}</Text>
    </View>
  );
}

function StatusCount({ status, value }: { status: AttendanceStatus; value: number }) {
  const meta = statusMeta(status);

  return (
    <View style={[styles.statusCount, { backgroundColor: meta.tint }]}>
      <View style={[styles.statusMarker, { backgroundColor: meta.color }]} />
      <Text style={[styles.statusCountValue, { color: meta.color }]}>{value}</Text>
      <Text style={styles.statusCountLabel}>{meta.label}</Text>
    </View>
  );
}

function AttendanceLegend() {
  const statuses: AttendanceStatus[] = ['attended', 'working', 'below', 'absent', 'weekend'];

  return (
    <View style={styles.legendCard}>
      <Text style={styles.legendTitle}>Status guide</Text>
      <View style={styles.legendRow}>
        {statuses.map((status) => {
          const meta = statusMeta(status);
          return (
            <View key={status} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: meta.color }]} />
              <Text style={styles.legendText}>{meta.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function DayCell({ cell }: { cell: AttendanceCell }) {
  const meta = statusMeta(cell.status);
  const showHours = cell.status === 'attended' || cell.status === 'working' || cell.status === 'below';

  return (
    <View style={[styles.dayCell, { backgroundColor: meta.tint }]}>
      <View style={[styles.dayTopBar, { backgroundColor: meta.color }]} />
      <Text style={styles.dayNumber}>{cell.day}</Text>
      <Text style={[styles.dayStatus, { color: meta.color }]}>
        {meta.short}
      </Text>
      <Text style={styles.dayHours}>{showHours ? formatHours(cell.workSeconds) : cell.status === 'absent' ? '-' : ''}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingTop: 56, paddingBottom: 32 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  header: { gap: 16, marginBottom: 18 },
  eyebrow: { ...typography.label, color: colors.brand },
  title: { ...typography.h1, fontSize: 30 },
  monthStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
  },
  stepButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  stepText: { fontSize: 28, color: colors.text, lineHeight: 30 },
  monthText: { fontSize: 15, fontWeight: '600', color: colors.text },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerTint,
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: 12,
    marginBottom: 14,
  },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: {
    width: '48.5%',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    minHeight: 116,
    ...shadow.sm,
  },
  summaryIcon: {
    width: 30,
    height: 30,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  summaryDot: { width: 12, height: 12, borderRadius: 6 },
  summaryValue: { fontSize: 26, fontWeight: '600', color: colors.text },
  summaryLabel: { fontSize: 12, color: colors.muted, marginTop: 4 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginTop: 14, marginBottom: 16 },
  metaText: { fontSize: 12, color: colors.muted },
  metaDot: { color: colors.mutedLight },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    marginBottom: 14,
  },
  segmentButton: { flex: 1, paddingVertical: 11, borderRadius: borderRadius.sm, alignItems: 'center' },
  segmentButtonActive: { backgroundColor: colors.brand },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  segmentTextActive: { color: colors.white },
  listGap: { gap: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...shadow.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 14 },
  attendanceCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...shadow.sm,
  },
  attendanceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  personRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.full,
    backgroundColor: colors.brandLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendanceAvatar: {
    width: 46,
    height: 46,
    borderRadius: borderRadius.full,
    backgroundColor: colors.brandLight,
    borderWidth: 1,
    borderColor: '#FFD6CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.brandDark, fontWeight: '600', fontSize: 13 },
  personText: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  subText: { fontSize: 12, color: colors.muted, marginTop: 3 },
  scorePill: {
    width: 62,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  scoreValue: { fontSize: 16, fontWeight: '600', color: colors.text },
  scoreLabel: { fontSize: 10, color: colors.muted, marginTop: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: borderRadius.full },
  badgeText: { fontSize: 11, fontWeight: '600' },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: {
    width: '48%',
    backgroundColor: colors.surface2,
    borderRadius: borderRadius.sm,
    padding: 10,
  },
  metricLabel: { fontSize: 11, color: colors.muted, marginBottom: 4 },
  metricValue: { fontSize: 14, color: colors.text, fontWeight: '600' },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 12 },
  footerText: { flex: 1, fontSize: 12, color: colors.muted },
  progressTrack: {
    height: 8,
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: borderRadius.full,
    backgroundColor: colors.divider,
    marginBottom: 12,
  },
  progressChunk: { height: 8 },
  attendanceStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  statusCount: {
    width: '48.5%',
    minHeight: 54,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  statusMarker: { width: 18, height: 3, borderRadius: borderRadius.full, marginBottom: 6 },
  statusCountValue: { fontSize: 16, fontWeight: '600' },
  statusCountLabel: { fontSize: 11, color: colors.muted, marginTop: 1 },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  calendarTitle: { fontSize: 13, fontWeight: '600', color: colors.text },
  calendarHint: { fontSize: 11, fontWeight: '600', color: colors.mutedLight },
  legendCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  legendTitle: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 10 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface2,
    borderRadius: borderRadius.full,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 11, fontWeight: '600', color: colors.muted },
  employeeStats: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  miniStat: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: borderRadius.sm,
    paddingVertical: 10,
    alignItems: 'center',
  },
  miniValue: { fontSize: 17, fontWeight: '600' },
  miniLabel: { fontSize: 10, color: colors.muted, marginTop: 2 },
  dayRail: { gap: 8, paddingRight: 2 },
  dayCell: {
    width: 52,
    height: 78,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 7,
    paddingTop: 11,
    paddingBottom: 7,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  dayTopBar: { position: 'absolute', left: 0, right: 0, top: 0, height: 4 },
  dayNumber: { fontSize: 13, fontWeight: '600', color: colors.text },
  dayStatus: { fontSize: 18, fontWeight: '600', lineHeight: 21 },
  dayHours: { fontSize: 10, color: colors.muted, fontWeight: '600' },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 6, lineHeight: 19 },
});
