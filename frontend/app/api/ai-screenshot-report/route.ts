import { NextResponse } from "next/server";

const getSidecarUrl = () => process.env.SCREENSHOT_AI_URL?.trim() || "http://localhost:5055";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") || "team";
  const requestedDate = url.searchParams.get("date");
  const requestedStart = url.searchParams.get("start");
  const requestedEnd = url.searchParams.get("end");
  const requestedRange = url.searchParams.get("range");
  const requestedUserId = url.searchParams.get("userId");
  const requestedUserIds = url.searchParams.get("userIds");
  const minScreenshots = url.searchParams.get("minScreenshots") || "10";

  const sidecarUrl = new URL("/summary", getSidecarUrl());
  sidecarUrl.searchParams.set("scope", scope);
  sidecarUrl.searchParams.set("minScreenshots", minScreenshots);
  if (requestedDate) sidecarUrl.searchParams.set("date", requestedDate);
  if (requestedStart) sidecarUrl.searchParams.set("start", requestedStart);
  if (requestedEnd) sidecarUrl.searchParams.set("end", requestedEnd);
  if (requestedRange) sidecarUrl.searchParams.set("range", requestedRange);
  if (requestedUserId) sidecarUrl.searchParams.set("userId", requestedUserId);
  if (requestedUserIds) sidecarUrl.searchParams.set("userIds", requestedUserIds);

  try {
    const response = await fetch(sidecarUrl, { cache: "no-store" });
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
