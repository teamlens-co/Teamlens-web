#!/usr/bin/env node

const DEFAULT_BASE_URL = "http://localhost:5000";
const DEFAULT_TIMEOUT_MS = 10000;

const args = process.argv.slice(2);

const getArgValue = (name, fallback) => {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) {
    return args[index + 1];
  }

  return fallback;
};

const hasFlag = (name) => args.includes(name);

const baseUrl = (getArgValue("--base-url", process.env.API_BASE_URL) || DEFAULT_BASE_URL).replace(/\/+$/, "");
const timeoutMs = Number(getArgValue("--timeout", process.env.API_CHECK_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
const jsonOutput = hasFlag("--json");
const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;

const endpoints = [
  { name: "Backend health", method: "GET", path: "/health", expected: [200] },
  { name: "Web health", method: "GET", path: "/api/web/health", expected: [200] },
  { name: "Mobile health", method: "GET", path: "/api/mobile/health", expected: [200] },

  { name: "Manager signup validation", method: "POST", path: "/api/web/auth/signup-manager", body: {}, expected: [400] },
  { name: "Web login validation", method: "POST", path: "/api/web/auth/login", body: {}, expected: [400] },
  { name: "Web logout", method: "POST", path: "/api/web/auth/logout", expected: [200] },
  { name: "Web current user", method: "GET", path: "/api/web/auth/me", auth: true, expected: [200, 401] },
  { name: "Create agent token", method: "POST", path: "/api/web/auth/agent-token", auth: true, body: { label: "Endpoint check" }, expected: [201, 400, 401, 403] },

  { name: "Dashboard analytics", method: "GET", path: "/api/web/dashboard/analytics", auth: true, expected: [200, 401] },
  { name: "Activity timeline", method: "GET", path: "/api/web/dashboard/activity-timeline", auth: true, expected: [200, 401] },
  { name: "Usage report", method: "GET", path: "/api/web/dashboard/usage-report", auth: true, expected: [200, 401] },
  { name: "Manual hours", method: "POST", path: "/api/web/dashboard/manual-hours", auth: true, body: {}, expected: [200, 400, 401, 403] },
  { name: "Calendar heatmap", method: "GET", path: `/api/web/dashboard/calendar?year=${currentYear}&month=${currentMonth}`, auth: true, expected: [200, 401] },
  { name: "List classification rules", method: "GET", path: "/api/web/classification-rules", auth: true, expected: [200, 401] },
  { name: "Upsert classification rule", method: "POST", path: "/api/web/classification-rules", auth: true, body: {}, expected: [200, 201, 400, 401, 403] },

  { name: "Team users", method: "GET", path: "/api/web/users", auth: true, expected: [200, 401, 403] },
  { name: "Create team", method: "POST", path: "/api/web/teams", auth: true, body: {}, expected: [200, 201, 400, 401, 403] },
  { name: "List teams", method: "GET", path: "/api/web/teams", auth: true, expected: [200, 401, 403] },
  { name: "Get team", method: "GET", path: "/api/web/teams/__endpoint-check__", auth: true, expected: [200, 400, 401, 403, 404] },
  { name: "Update team", method: "PUT", path: "/api/web/teams/__endpoint-check__", auth: true, body: {}, expected: [200, 400, 401, 403, 404] },
  { name: "Delete team", method: "DELETE", path: "/api/web/teams/__endpoint-check__", auth: true, expected: [200, 204, 400, 401, 403, 404] },
  { name: "Add team member", method: "POST", path: "/api/web/teams/__endpoint-check__/members", auth: true, body: {}, expected: [200, 201, 400, 401, 403, 404] },
  { name: "Remove team member", method: "DELETE", path: "/api/web/teams/__endpoint-check__/members/__endpoint-user__", auth: true, expected: [200, 204, 400, 401, 403, 404] },
  { name: "Team analytics", method: "GET", path: "/api/web/teams/__endpoint-check__/analytics", auth: true, expected: [200, 400, 401, 403, 404] },

  { name: "Create invite", method: "POST", path: "/api/web/invites", auth: true, body: {}, expected: [200, 201, 400, 401, 403] },
  { name: "Validate invite", method: "GET", path: "/api/web/invites/validate", expected: [400, 404] },
  { name: "Accept invite", method: "POST", path: "/api/web/invites/accept", body: {}, expected: [400] },

  { name: "Office locations", method: "GET", path: "/api/web/locations", auth: true, expected: [200, 401] },
  { name: "Upsert office location", method: "PUT", path: "/api/web/locations", auth: true, body: {}, expected: [200, 201, 400, 401, 403] },
  { name: "Delete office location", method: "DELETE", path: "/api/web/locations/__endpoint-check__", auth: true, expected: [200, 204, 400, 401, 403, 404] },

  { name: "Upload recording", method: "POST", path: "/api/web/recordings", auth: true, body: {}, expected: [200, 201, 400, 401, 403] },
  { name: "List recordings", method: "GET", path: "/api/web/recordings", auth: true, expected: [200, 401] },
  { name: "Get recording file", method: "GET", path: "/api/web/recordings/__endpoint-check__/file", auth: true, expected: [200, 400, 401, 403, 404] },
  { name: "Delete recording", method: "DELETE", path: "/api/web/recordings/__endpoint-check__", auth: true, expected: [200, 204, 400, 401, 403, 404] },

  { name: "Agent login validation", method: "POST", path: "/api/agent/auth/login", body: {}, expected: [400] },
  { name: "Agent active session", method: "GET", path: "/api/agent/active-session", auth: true, expected: [200, 401] },
  { name: "Agent clock in", method: "POST", path: "/api/agent/clock-in", auth: true, body: {}, expected: [200, 201, 400, 401] },
  { name: "Agent clock out", method: "POST", path: "/api/agent/clock-out", auth: true, body: {}, expected: [200, 400, 401] },
  { name: "Create activity", method: "POST", path: "/api/agent/activity", auth: true, body: {}, expected: [200, 201, 400, 401] },
  { name: "Create usage", method: "POST", path: "/api/agent/usage", auth: true, body: {}, expected: [200, 201, 400, 401] },
  { name: "Upload screenshot", method: "POST", path: "/api/agent/screenshots", auth: true, body: {}, expected: [200, 201, 400, 401] },
  { name: "List screenshots", method: "GET", path: "/api/agent/screenshots", auth: true, expected: [200, 401] },
  { name: "Get screenshot", method: "GET", path: "/api/agent/screenshots/__endpoint-check__", expected: [200, 400, 404] },
];

const credentials = {
  email: process.env.API_TEST_EMAIL || process.env.TEST_EMAIL,
  password: process.env.API_TEST_PASSWORD || process.env.TEST_PASSWORD,
};

const request = async (endpoint, auth) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {};

  if (endpoint.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  if (endpoint.auth && auth?.token) {
    headers.authorization = `Bearer ${auth.token}`;
  }

  if (endpoint.auth && auth?.cookie) {
    headers.cookie = auth.cookie;
  }

  const startedAt = Date.now();

  try {
    const response = await fetch(`${baseUrl}${endpoint.path}`, {
      method: endpoint.method,
      headers,
      body: endpoint.body !== undefined ? JSON.stringify(endpoint.body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let payload = text;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text.slice(0, 300);
    }

    return {
      status: response.status,
      durationMs: Date.now() - startedAt,
      ok: endpoint.expected.includes(response.status),
      payload,
      setCookie: response.headers.get("set-cookie"),
    };
  } catch (error) {
    return {
      status: null,
      durationMs: Date.now() - startedAt,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
};

const tryLogin = async () => {
  if (process.env.API_TEST_TOKEN) {
    return { auth: { token: process.env.API_TEST_TOKEN }, source: "API_TEST_TOKEN" };
  }

  if (!credentials.email || !credentials.password) {
    return { auth: null, source: null };
  }

  const login = await request(
    {
      name: "Web login",
      method: "POST",
      path: "/api/web/auth/login",
      body: credentials,
      expected: [200],
    },
    null,
  );

  const jsonToken =
    login.payload &&
    typeof login.payload === "object" &&
    login.payload.data &&
    (login.payload.data.accessToken || login.payload.data.token);
  const cookie = login.setCookie ? login.setCookie.split(";")[0] : null;

  const auth = {};
  if (typeof jsonToken === "string") {
    auth.token = jsonToken;
  }
  if (cookie) {
    auth.cookie = cookie;
  }

  return {
    auth: auth.token || auth.cookie ? auth : null,
    source: login.ok && (auth.token || auth.cookie) ? "API_TEST_EMAIL/API_TEST_PASSWORD" : null,
    failure:
      login.ok && !(auth.token || auth.cookie)
        ? "Login succeeded but no auth token or auth cookie was returned"
        : login.ok
          ? null
          : `Login failed with ${login.status}: ${formatPayloadMessage(login)}`,
    login,
  };
};

const formatPayloadMessage = (result) => {
  if (result.error) {
    return result.error;
  }

  const payload = result.payload;
  if (payload && typeof payload === "object") {
    return payload.message || JSON.stringify(payload).slice(0, 160);
  }

  return typeof payload === "string" ? payload.slice(0, 160) : "";
};

const main = async () => {
  if (typeof fetch !== "function") {
    console.error("This script requires Node.js 18+ because it uses the built-in fetch API.");
    process.exit(1);
  }

  const loginResult = await tryLogin();
  const auth = loginResult.auth;

  const results = [];

  for (const endpoint of endpoints) {
    const result = await request(endpoint, auth);
    results.push({
      ...endpoint,
      ...result,
    });
  }

  const failed = results.filter((result) => !result.ok);
  const authFailure = loginResult.failure && (credentials.email || credentials.password || process.env.API_TEST_TOKEN);

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          baseUrl,
          authSource: loginResult.source,
          summary: {
            total: results.length,
            passed: results.length - failed.length,
            failed: failed.length + (authFailure ? 1 : 0),
          },
          authFailure: loginResult.failure,
          results,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`Endpoint check: ${baseUrl}`);
    console.log(`Auth: ${loginResult.source || "none (protected routes should return 401)"}`);
    if (loginResult.failure) {
      console.log(`Auth issue: ${loginResult.failure}`);
    }
    console.log("");

    for (const result of results) {
      const marker = result.ok ? "PASS" : "FAIL";
      const status = result.status === null ? "NO_RESPONSE" : result.status;
      const message = result.ok ? "" : ` - ${formatPayloadMessage(result)}`;
      console.log(`${marker.padEnd(4)} ${result.method.padEnd(6)} ${result.path.padEnd(55)} ${String(status).padEnd(11)} ${result.durationMs}ms${message}`);
    }

    console.log("");
    console.log(`Summary: ${results.length - failed.length}/${results.length} passed, ${failed.length + (authFailure ? 1 : 0)} failed`);

    if (failed.length > 0 || authFailure) {
      console.log("");
      console.log("Not working:");
      if (authFailure) {
        console.log(`- Auth setup failed: ${loginResult.failure}`);
      }
      for (const result of failed) {
        const status = result.status === null ? "NO_RESPONSE" : result.status;
        console.log(`- ${result.method} ${result.path} (${result.name}) returned ${status}; expected ${result.expected.join(", ")}`);
      }
    }
  }

  process.exitCode = failed.length > 0 || authFailure ? 1 : 0;
};

main();
