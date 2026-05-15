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
  dailyAverage?: number;
  sessionCount?: number;
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
  url: string;
  capturedAt: string;
  application?: string;
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
