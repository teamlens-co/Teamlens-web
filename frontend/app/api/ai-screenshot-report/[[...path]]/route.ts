import { NextResponse } from "next/server";

const SIDECAR_URL = process.env.SCREENSHOT_AI_URL?.trim() || "http://localhost:5055";

const ENDPOINT_MAP: Record<string, string> = {
  "/": "/summary",
  "/health": "/health",
  "/live-summaries": "/live-summaries",
  "/periodic-summaries": "/periodic-summaries",
  "/config/report-interval": "/config/report-interval",
};

async function proxyRequest(
  request: Request,
  params: { path?: string[] }
): Promise<NextResponse> {
  const url = new URL(request.url);
  const subPath = "/" + (params.path?.join("/") || "");
  const sidecarPath = ENDPOINT_MAP[subPath] || subPath;
  const sidecarUrl = new URL(sidecarPath, SIDECAR_URL);

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

export async function GET(
  request: Request,
  segmentData: { params: Promise<{ path?: string[] }> }
) {
  const params = await segmentData.params;
  return proxyRequest(request, params);
}

export async function POST(
  request: Request,
  segmentData: { params: Promise<{ path?: string[] }> }
) {
  const params = await segmentData.params;
  return proxyRequest(request, params);
}
