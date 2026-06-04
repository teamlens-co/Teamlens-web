import { NextResponse } from "next/server";

const SIDECAR_URL = process.env.SCREENSHOT_AI_URL?.trim() || "http://localhost:5055";

const ENDPOINT_MAP: Record<string, string> = {
  "/api/ai-screenshot-report": "/summary",
  "/api/ai-screenshot-report/health": "/health",
  "/api/ai-screenshot-report/live-summaries": "/live-summaries",
  "/api/ai-screenshot-report/periodic-summaries": "/periodic-summaries",
  "/api/ai-screenshot-report/config/report-interval": "/config/report-interval",
};

async function proxyRequest(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const path = url.pathname;
  const sidecarPath = ENDPOINT_MAP[path] || "/summary";
  const sidecarUrl = new URL(sidecarPath, SIDECAR_URL);

  // Forward all query params
  url.searchParams.forEach((value, key) => {
    sidecarUrl.searchParams.set(key, value);
  });

  try {
    const fetchOptions: RequestInit = { cache: "no-store" };
    if (request.method === "POST") {
      fetchOptions.method = "POST";
      const body = await request.text();
      if (body) fetchOptions.body = body;
    }
    const response = await fetch(sidecarUrl, fetchOptions);
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Live screenshot intelligence sidecar is not running. Restart screenshot-ai with python main.py.",
        data: null,
      },
      { status: 503 },
    );
  }
}

export async function GET(request: Request) {
  return proxyRequest(request);
}

export async function POST(request: Request) {
  return proxyRequest(request);
}
