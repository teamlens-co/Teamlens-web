import { NativeModules, Platform } from 'react-native';

// Default: nginx gateway on port 80 (docker compose routes /api/* → Go API)
const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const getMetroHost = (): string | null => {
  const scriptURL = NativeModules.SourceCode?.scriptURL;
  if (typeof scriptURL !== 'string') return null;

  const match = scriptURL.match(/^[a-z]+:\/\/([^/:]+)/i);
  return match?.[1] ?? null;
};

const getDefaultApiBase = () => {
  const metroHost = getMetroHost();
  if (metroHost) return `http://${metroHost}/api`;

  if (Platform.OS === 'android') return 'http://10.0.2.2/api';
  return 'http://localhost/api';
};

export const API_BASE = trimTrailingSlash(process.env.EXPO_PUBLIC_API_URL || getDefaultApiBase());

class ApiService {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<{ ok: boolean; data?: T; message?: string }> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const responseText = await response.text();
      let json: { success?: boolean; data?: T; message?: string } = {};
      try {
        json = responseText ? JSON.parse(responseText) : {};
      } catch {
        return {
          ok: false,
          message: `Unexpected response from ${API_BASE}. Check that the API gateway is running.`,
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          message: json.message || `Request failed (${response.status})`,
        };
      }

      if (json.success && json.data) {
        return { ok: true, data: json.data as T };
      }
      return { ok: false, message: json.message || 'Request failed' };
    } catch {
      return {
        ok: false,
        message: `Network error. Check that your phone and server are on the same network, and that ${API_BASE} is reachable.`,
      };
    }
  }

  // ── Auth ─────────────────────────────────────────────────────────────

  async login(email: string, password: string) {
    return this.request<import('../types').AuthResponse>('POST', '/web/auth/login', { email, password });
  }

  async signup(fullName: string, email: string, password: string, organizationName: string) {
    return this.request<import('../types').AuthResponse>('POST', '/web/auth/signup', {
      fullName, email, password, organizationName,
    });
  }

  async getMe() {
    return this.request<import('../types').User>('GET', '/web/auth/me');
  }

  // ── Dashboard ────────────────────────────────────────────────────────

  async getDashboardAnalytics(startDate: string, endDate: string, userId?: string) {
    const params = new URLSearchParams({ startDate, endDate });
    if (userId) params.append('userId', userId);
    return this.request<import('../types').DashboardAnalytics>('GET', `/web/dashboard/analytics?${params}`);
  }

  async getCalendarHeatmap(year: number, month: number, userId?: string) {
    const params = new URLSearchParams({ year: String(year), month: String(month) });
    if (userId) params.append('userId', userId);
    return this.request<import('../types').CalendarDay[]>('GET', `/web/dashboard/calendar?${params}`);
  }

  // ── Attendance ────────────────────────────────────────────────────────

  async getAttendance(startDate: string, endDate: string) {
    const params = new URLSearchParams({ startDate, endDate });
    return this.request<import('../types').AttendanceEntry[]>('GET', `/web/dashboard/attendance?${params}`);
  }

  async getActivityTimeline(startDate: string, endDate: string, userId?: string) {
    const params = new URLSearchParams({ startDate, endDate });
    if (userId) params.append('userId', userId);
    return this.request<import('../types').ActivityEntry[]>('GET', `/web/dashboard/activity-timeline?${params}`);
  }

  async getUsageReport(startDate: string, endDate: string, userId?: string, groupBy = 'total') {
    const params = new URLSearchParams({ startDate, endDate, groupBy });
    if (userId) params.append('userId', userId);
    return this.request<import('../types').UsageReport>('GET', `/web/dashboard/usage-report?${params}`);
  }

  // ── Team ──────────────────────────────────────────────────────────────

  async getTeams() {
    return this.request<{ id: string; name: string; memberCount: number }[]>('GET', '/web/teams');
  }

  async getTeamMembers(teamId: string) {
    return this.request<import('../types').TeamMember[]>('GET', `/web/teams/${teamId}/members`);
  }

  // ── Users ─────────────────────────────────────────────────────────────

  async getUsers() {
    return this.request<import('../types').User[]>('GET', '/web/users');
  }

  // ── Recordings & Screenshots ──────────────────────────────────────────

  async getRecordings() {
    return this.request<import('../types').Recording[]>('GET', '/web/recordings');
  }

  async getScreenshots(userId?: string) {
    const params = userId ? `?userId=${userId}` : '';
    return this.request<import('../types').Screenshot[]>('GET', `/agent/screenshots${params}`);
  }

  // ── Manual Time ───────────────────────────────────────────────────────

  async getManualTimeRequests() {
    return this.request<import('../types').ManualTimeRequest[]>('GET', '/web/manual-time-requests');
  }

  // ── Settings ──────────────────────────────────────────────────────────

  async getSettings() {
    return this.request<Record<string, unknown>>('GET', '/web/settings');
  }
}

export const api = new ApiService();
export default api;
