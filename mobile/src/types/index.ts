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

export interface CalendarDay {
  date: string;
  activeMinutes: number;
  color?: string;
}

export interface Screenshot {
  id: string;
  userId: string;
  url: string; // Map from filePath if needed, but usually the API returns a URL
  capturedAt: string;
  employeeName?: string;
  activeApplication?: string;
  windowTitle?: string;
}

export interface Recording {
  id: string;
  url: string;
  duration: number;
  capturedAt: string;
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
  appPattern: string;
  titlePattern: string;
  category: 'productive' | 'neutral' | 'unproductive';
  label: string;
  color: string;
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

export interface UsageReport {
  items: UsageReportItem[];
  categories?: Array<{
    name: string;
    category: string;
    durationSeconds: number;
  }>;
  breakdowns?: Array<{
    name: string;
    employeeName: string;
    teamName: string;
    locationName: string;
    durationSeconds: number;
    samples: number;
  }>;
  groupBy?: string;
}
