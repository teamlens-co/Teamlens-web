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
export const WEB_BASE = trimTrailingSlash(
  process.env.EXPO_PUBLIC_WEB_URL ||
  API_BASE.replace(/\/api$/, '').replace(':5000', ':3000')
);
export const WEB_API_BASE = trimTrailingSlash(
  process.env.EXPO_PUBLIC_WEB_API_BASE ||
  API_BASE.replace(/\/api$/, '')
);
export const WEB_WS_BASE = trimTrailingSlash(
  process.env.EXPO_PUBLIC_WS_URL ||
  API_BASE.replace(/\/api$/, '').replace(':5000', ':4000')
);

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

      if (json.success) {
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
    return this.request<import('../types').AttendanceOverview>('GET', `/web/dashboard/attendance?${params}`);
  }

  async getActivityTimeline(startDate: string, endDate: string, userId?: string) {
    const params = new URLSearchParams({ startDate, endDate });
    if (userId) params.append('userId', userId);
    return this.request<import('../types').ActivityEntry[]>('GET', `/web/dashboard/activity-timeline?${params}`);
  }

  async getTeamAnalytics(teamId: string, startDate: string, endDate: string) {
    const params = new URLSearchParams({ startDate, endDate });
    return this.request<import('../types').DashboardAnalytics>('GET', `/web/teams/${teamId}/analytics?${params}`);
  }

  async getUsageReport(startDate: string, endDate: string, userId?: string, groupBy = 'total', teamId?: string) {
    const params = new URLSearchParams({ startDate, endDate, groupBy });
    if (userId) params.append('userId', userId);
    if (teamId) params.append('teamId', teamId);
    return this.request<import('../types').UsageReport>('GET', `/web/dashboard/usage-report?${params}`);
  }

  // ── Team ──────────────────────────────────────────────────────────────

  async getTeams() {
    return this.request<import('../types').Team[]>('GET', '/web/teams');
  }

  async createTeam(name: string, description?: string) {
    return this.request<import('../types').Team>('POST', '/web/teams', { name, description });
  }

  async updateTeam(teamId: string, name: string, description?: string) {
    return this.request<import('../types').Team>('PUT', `/web/teams/${teamId}`, { name, description });
  }

  async deleteTeam(teamId: string) {
    return this.request<unknown>('DELETE', `/web/teams/${teamId}`);
  }

  async getTeamMembers(teamId: string) {
    return this.request<import('../types').TeamMember[]>('GET', `/web/teams/${teamId}/members`);
  }

  async addTeamMember(teamId: string, userId: string) {
    return this.request<unknown>('POST', `/web/teams/${teamId}/members`, { userId });
  }

  async removeTeamMember(teamId: string, userId: string) {
    return this.request<unknown>('DELETE', `/web/teams/${teamId}/members/${userId}`);
  }

  // ── Users ─────────────────────────────────────────────────────────────

  async getUsers() {
    return this.request<import('../types').User[]>('GET', '/web/users');
  }

  async deleteEmployee(employeeId: string) {
    return this.request<unknown>('DELETE', `/web/employees/${employeeId}`);
  }

  async createInvite(email: string, role: 'MANAGER' | 'EMPLOYEE' = 'EMPLOYEE', teamId?: string) {
    return this.request<import('../types').Invite>('POST', '/web/invites', { email, role, teamId });
  }

  async getInvites() {
    return this.request<import('../types').Invite[]>('GET', '/web/invites');
  }

  async revokeInvite(inviteId: string) {
    return this.request<unknown>('POST', `/web/invites/${inviteId}/revoke`);
  }

  // ── Recordings & Screenshots ──────────────────────────────────────────

  async getRecordings(userId?: string) {
    const params = new URLSearchParams();
    if (userId) params.append('userId', userId);
    const query = params.toString();
    return this.request<import('../types').Recording[]>('GET', `/web/recordings${query ? `?${query}` : ''}`);
  }

  async deleteRecording(recordingId: string) {
    return this.request<unknown>('DELETE', `/web/recordings/${recordingId}`);
  }

  async getScreenshots(options?: { userId?: string; startDate?: string; endDate?: string; limit?: number }) {
    const params = new URLSearchParams();
    if (options?.userId) params.append('userId', options.userId);
    if (options?.startDate) params.append('startDate', options.startDate);
    if (options?.endDate) params.append('endDate', options.endDate);
    if (options?.limit) params.append('limit', String(options.limit));
    const query = params.toString();
    return this.request<import('../types').Screenshot[]>('GET', `/agent/screenshots${query ? `?${query}` : ''}`);
  }

  async deleteScreenshot(screenshotId: string) {
    return this.request<unknown>('DELETE', `/agent/screenshots/${screenshotId}`);
  }

  // ── Manual Time ───────────────────────────────────────────────────────

  async getManualTimeRequests() {
    return this.request<import('../types').ManualTimeRequest[]>('GET', '/web/manual-time-requests');
  }

  async createManualTimeRequest(date: string, hours: number, reason: string) {
    return this.request<import('../types').ManualTimeRequest>('POST', '/web/dashboard/manual-time-requests', {
      date,
      hours,
      reason,
    });
  }

  async reviewManualTimeRequest(id: string, status: 'approved' | 'rejected', managerNote?: string) {
    return this.request<import('../types').ManualTimeRequest>('PATCH', `/web/dashboard/manual-time-requests/${id}/review`, {
      status,
      managerNote,
    });
  }

  // ── Settings ──────────────────────────────────────────────────────────

  async getSettings() {
    return this.request<Record<string, unknown>>('GET', '/web/settings');
  }

  async updateSettings(settings: Record<string, unknown>) {
    return this.request<Record<string, unknown>>('PATCH', '/web/settings', settings);
  }

  async getLocations() {
    return this.request<import('../types').OfficeLocation[]>('GET', '/web/locations');
  }

  async searchLocations(query: string) {
    return this.request<import('../types').LocationSearchResult[]>('GET', `/web/locations/search?q=${encodeURIComponent(query)}`);
  }

  async saveLocation(payload: Partial<import('../types').OfficeLocation>) {
    return this.request<import('../types').OfficeLocation>('POST', '/web/locations', payload as Record<string, unknown>);
  }

  async deleteLocation(locationId: string) {
    return this.request<unknown>('DELETE', `/web/locations/${locationId}`);
  }

  async getClassificationRules() {
    return this.request<import('../types').ClassificationRule[]>('GET', '/web/classification-rules');
  }

  async upsertClassificationRule(rule: Partial<import('../types').ClassificationRule>) {
    return this.request<import('../types').ClassificationRule>('POST', '/web/classification-rules', rule as Record<string, unknown>);
  }
}

export const api = new ApiService();
export default api;
