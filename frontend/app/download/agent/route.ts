import { NextResponse } from "next/server";

const DOWNLOAD_CONFIG_ERROR =
  "Agent download is not configured. Please contact support.";

const WINDOWS_UPDATER_JSON_URL =
  "https://github.com/teamlens-co/Teamlens-web/releases/latest/download/teamlens-agent-latest.json";
const WINDOWS_GITHUB_LATEST_RELEASE_API =
  "https://api.github.com/repos/teamlens-co/Teamlens-web/releases/latest";
const LINUX_GITHUB_LATEST_RELEASE_API =
  "https://api.github.com/repos/teamlens-co/teamlens-linux-agent/releases/latest";

export const dynamic = "force-dynamic";

async function resolveWindowsExeUrl(): Promise<string | null> {
  try {
    const res = await fetch(WINDOWS_UPDATER_JSON_URL, {
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

async function resolveWindowsMsiUrl(): Promise<string | null> {
  try {
    const res = await fetch(WINDOWS_GITHUB_LATEST_RELEASE_API, {
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

async function resolveLinuxAssetUrl(extension: string): Promise<string | null> {
  try {
    const res = await fetch(LINUX_GITHUB_LATEST_RELEASE_API, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const asset = (data.assets || []).find((a: { name: string }) =>
      a.name.toLowerCase().endsWith(extension.toLowerCase()),
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
    switch (type) {
      case "msi":
        downloadUrl = await resolveWindowsMsiUrl();
        break;
      case "linux-deb":
        downloadUrl = await resolveLinuxAssetUrl(".deb");
        break;
      case "linux-appimage":
        downloadUrl = await resolveLinuxAssetUrl(".appimage");
        break;
      case "linux":
        // Default Linux artifact: prefer AppImage, fall back to .deb.
        downloadUrl =
          (await resolveLinuxAssetUrl(".appimage")) ||
          (await resolveLinuxAssetUrl(".deb"));
        break;
      case "exe":
      default:
        downloadUrl = await resolveWindowsExeUrl();
        break;
    }
  }

  if (!downloadUrl) {
    return NextResponse.json(
      { success: false, message: DOWNLOAD_CONFIG_ERROR },
      { status: 503 },
    );
  }

  return NextResponse.redirect(downloadUrl, { status: 302 });
}
