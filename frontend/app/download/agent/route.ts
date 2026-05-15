import { NextResponse } from "next/server";

const DOWNLOAD_CONFIG_ERROR =
  "Agent download is not configured. Please contact support.";
const LOCAL_AGENT_DOWNLOAD_PATH = "/downloads/TeamLens_0.1.2_x64-setup.exe";

function resolveDownloadUrl(): string | null {
  const configuredUrl =
    process.env.AGENT_DOWNLOAD_URL?.trim() ||
    process.env.NEXT_PUBLIC_AGENT_DOWNLOAD_URL?.trim();

  if (!configuredUrl) {
    return LOCAL_AGENT_DOWNLOAD_PATH;
  }

  try {
    const parsed = new URL(configuredUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export function GET(request: Request) {
  const downloadUrl = resolveDownloadUrl();

  if (!downloadUrl) {
    return NextResponse.json(
      {
        success: false,
        message: DOWNLOAD_CONFIG_ERROR,
      },
      { status: 503 },
    );
  }

  return NextResponse.redirect(new URL(downloadUrl, request.url), { status: 302 });
}
