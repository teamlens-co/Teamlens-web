import { NextResponse } from "next/server";

const DOWNLOAD_CONFIG_ERROR =
  "Agent download is not available right now. Please try again later.";

const UPDATER_JSON_URL =
  "https://github.com/teamlens-co/Teamlens-web/releases/latest/download/teamlens-agent-latest.json";
const GITHUB_LATEST_RELEASE_API =
  "https://api.github.com/repos/teamlens-co/Teamlens-web/releases/latest";

export const dynamic = "force-dynamic";

async function resolveExeUrl(): Promise<string | null> {
  try {
    const res = await fetch(UPDATER_JSON_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.platforms?.["windows-x86_64"]?.url || null;
  } catch {
    return null;
  }
}

async function resolveMsiUrl(): Promise<string | null> {
  try {
    const res = await fetch(GITHUB_LATEST_RELEASE_API, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const asset = (data.assets || []).find((a: { name: string }) =>
      a.name.endsWith(".msi"),
    );
    return asset?.browser_download_url || null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "exe";
  const configuredUrl = process.env.AGENT_DOWNLOAD_URL?.trim();

  let downloadUrl: string | null = configuredUrl || null;

  if (!downloadUrl) {
    downloadUrl = type === "msi" ? await resolveMsiUrl() : await resolveExeUrl();
  }

  if (!downloadUrl) {
    return NextResponse.json(
      { success: false, message: DOWNLOAD_CONFIG_ERROR },
      { status: 503 },
    );
  }

  return NextResponse.redirect(downloadUrl, { status: 302 });
}
