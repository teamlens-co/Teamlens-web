// Types matching Go API responses
export interface User {
  id: string;
  fullName: string;
  email: string;
  role: 'MANAGER' | 'EMPLOYEE';
  organization?: Organization;
  status?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
  organization: Organization;
}

export interface DashboardAnalytics {
  userID: string;
  range: string;
  totalActiveHours?: number;
  totalIdleHours?: number;
  totalActiveMinutes?: number;
  totalIdleMinutes?: number;
  activePercentage?: number;
  activeSeconds?: number;
  idleSeconds?: number;
  productivityPercent?: number;
  dailyAverage?: number;
  sessionCount?: number;
  sessions?: unknown[];
  dayData?: DayData[];
}

export interface DayData {
  date: string;
  activeMinutes: number;
  idleMinutes: number;
  sessionCount: number;
}

export interface ActivityEntry {
  id: string;
  timestamp: string;
  type: string;
  application: string;
  title: string;
  duration: number;
}

export interface TeamMember {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  activeToday?: number;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  memberCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Invite {
  id: string;
  email: string;
  role: 'MANAGER' | 'EMPLOYEE';
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED' | string;
  token?: string;
  inviteUrl?: string;
  expiresAt?: string;
  createdAt?: string;
}

export interface AttendanceEntry {
  id: string;
  userId: string;
  fullName: string;
  date: string;
  clockIn: string;
  clockOut: string | null;
  totalHours: number;
  status: 'present' | 'absent' | 'late' | 'half-day';
}

export type AttendanceStatus = 'attended' | 'working' | 'below' | 'absent' | 'weekend' | 'future';

export interface AttendanceSession {
  id: string;
  clockInAt: string;
  clockOutAt: string | null;
  workSeconds: number;
  shiftName?: string;
  locationType?: string;
  isCurrentlyWorking?: boolean;
}

export interface AttendanceCell {
  date: string;
  day: number;
  status: AttendanceStatus;
  workSeconds: number;
  shiftName?: string;
  locationStatus?: string;
  clockInAt?: string | null;
  clockOutAt?: string | null;
  sessions?: AttendanceSession[];
}

export interface AttendanceEmployee {
  userId: string;
  employeeName: string;
  email?: string;
  initials?: string;
  attendedDays: number;
  belowThresholdDays: number;
  absentDays: number;
  workingDays: number;
  officeDays: number;
  remoteDays: number;
  shiftSummary?: string;
  cells: AttendanceCell[];
}

export interface TimesheetEntry {
  id: string;
  userId: string;
  employeeName: string;
  teamName?: string;
  locationStatus?: string;
  shiftName?: string;
  date: string;
  clockInAt: string;
  clockOutAt: string | null;
  workSeconds: number;
  activeSeconds?: number;
  isCurrentlyWorking?: boolean;
}

export interface AttendanceOverview {
  month: string;
  thresholdMinutes: number;
  daysInMonth: number;
  stats: {
    attendedDays: number;
    currentlyWorking: number;
    belowThreshold: number;
    employees: number;
    officeDays: number;
    remoteDays: number;
  };
  employees: AttendanceEmployee[];
  timesheets: TimesheetEntry[];
}

export interface CalendarDay {
  date: string;
  activeMinutes: number;
  color?: string;
}

export interface Screenshot {
  id: string;
  userId: string;
  url: string;
  filePath?: string;
  capturedAt: string;
  employeeName?: string;
  activeApplication?: string;
  windowTitle?: string;
  domain?: string;
  projectName?: string;
}

export interface Recording {
  id: string;
  userId?: string;
  employeeName?: string;
  url?: string;
  filePath?: string;
  duration?: number;
  durationSeconds?: number;
  capturedAt?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface ManualTimeRequest {
  id: string;
  userId: string;
  fullName: string;
  date: string;
  hours: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface ClassificationRule {
  id: string;
  appPattern?: string;
  titlePattern?: string;
  domainPattern?: string;
  targetType?: string;
  category: 'PRODUCTIVE' | 'NEUTRAL' | 'UNPRODUCTIVE' | 'productive' | 'neutral' | 'unproductive' | string;
  label?: string;
  color?: string;
  createdAt?: string;
}

export interface UsageReportItem {
  name: string;
  targetType: string;
  appName: string;
  domain: string;
  category: 'PRODUCTIVE' | 'UNPRODUCTIVE' | 'NEUTRAL' | string;
  durationSeconds: number;
  samples: number;
}

export interface UsageBreakdownItem {
  name: string;
  employeeName: string;
  teamName: string;
  locationName: string;
  durationSeconds: number;
  samples: number;
}

export interface UsageReport {
  items: UsageReportItem[];
  categories?: Array<{
    name: string;
    category: string;
    durationSeconds: number;
  }>;
  breakdowns?: UsageBreakdownItem[];
  groupBy?: string;
}

export interface OfficeLocation {
  id: string;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  createdAt?: string;
}

export interface LocationSearchResult {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  placeId?: string;
}
