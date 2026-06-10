import { NextResponse } from "next/server";

const ALERT_SERVICE_URL = process.env.ALERT_SERVICE_URL?.trim() || "http://localhost:5057";

async function proxyAlertRequest(
  request: Request,
  params: { path?: string[] }
): Promise<NextResponse> {
  const url = new URL(request.url);
  const subPath = params.path?.length ? `/${params.path.join("/")}` : "";
  const targetUrl = new URL(`/api/alerts${subPath}`, ALERT_SERVICE_URL);

  url.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  try {
    const headers = new Headers();
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);

    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
      cache: "no-store",
    };

    if (!["GET", "HEAD"].includes(request.method)) {
      const body = await request.text();
      if (body) fetchOptions.body = body;
    }

    const response = await fetch(targetUrl, fetchOptions);
    const text = await response.text();

    try {
      return NextResponse.json(JSON.parse(text), { status: response.status });
    } catch {
      return new NextResponse(text, {
        status: response.status,
        headers: { "content-type": response.headers.get("content-type") || "text/plain" },
      });
    }
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Alert service is not running.",
        data: null,
      },
      { status: 503 }
    );
  }
}

export async function GET(
  request: Request,
  segmentData: { params: Promise<{ path?: string[] }> }
) {
  const params = await segmentData.params;
  return proxyAlertRequest(request, params);
}

export async function POST(
  request: Request,
  segmentData: { params: Promise<{ path?: string[] }> }
) {
  const params = await segmentData.params;
  return proxyAlertRequest(request, params);
}
