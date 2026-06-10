"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Role = "MANAGER" | "EMPLOYEE";

type InvitePreview = {
  token: string;
  email: string;
  role: Role;
  expiresAt: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
};

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data: T;
};

const formatDateTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString();
};

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const token = searchParams.get("token")?.trim() ?? "";

  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");

  const [loadingInvite, setLoadingInvite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const apiBase = useMemo(() => {
    const envBase = process.env.NEXT_PUBLIC_API_URL?.trim();
    return envBase && envBase.length > 0 ? envBase.replace(/\/$/, "") : "";
  }, []);

  useEffect(() => {
    const validate = async () => {
      if (!token) {
        setStatusMessage("Invite link is missing a token.");
        setLoadingInvite(false);
        return;
      }

      setLoadingInvite(true);
      setStatusMessage("");

      try {
        const response = await fetch(`${apiBase}/api/web/invites/validate?token=${encodeURIComponent(token)}`, {
          method: "GET",
          cache: "no-store",
        });

        const payload = (await response.json()) as ApiResponse<InvitePreview>;
        if (!response.ok || !payload.success) {
          setStatusMessage(payload.message ?? "Invite is invalid or expired.");
          setInvite(null);
          return;
        }

        setInvite(payload.data);
      } catch {
        setStatusMessage("Unable to validate invite right now. Please try again.");
      } finally {
        setLoadingInvite(false);
      }
    };

    void validate();
  }, [apiBase, token]);

  const acceptInvite = async () => {
    if (!invite) {
      return;
    }

    const trimmedName = fullName.trim();
    if (trimmedName.length < 2) {
      setStatusMessage("Please enter your full name.");
      return;
    }

    if (password.length < 8) {
      setStatusMessage("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    setStatusMessage("");

    try {
      const acceptResponse = await fetch(`${apiBase}/api/web/invites/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          token: invite.token,
          fullName: trimmedName,
          password,
        }),
      });

      const acceptPayload = (await acceptResponse.json()) as ApiResponse<unknown>;
      if (!acceptResponse.ok || !acceptPayload.success) {
        setStatusMessage(acceptPayload.message ?? "Unable to accept invite.");
        return;
      }

      setStatusMessage("Invite accepted. Redirecting to dashboard...");
      router.push("/dashboard");
      router.refresh();
    } catch {
      setStatusMessage("Unable to complete invite acceptance. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <h1>Accept Team Invite</h1>
        <p>Finish your account setup to join your TeamLens workspace.</p>
      </header>

      <section className="auth-card">
        {loadingInvite ? <p className="status-text">Checking invite...</p> : null}

        {!loadingInvite && invite ? (
          <div className="auth-grid">
            <label>
              Organization
              <input value={invite.organization.name} readOnly />
            </label>

            <label>
              Role
              <input value={invite.role} readOnly />
            </label>

            <label>
              Invited Email
              <input value={invite.email} readOnly />
            </label>

            <label>
              Expires At
              <input value={formatDateTime(invite.expiresAt)} readOnly />
            </label>

            <label>
              Full Name
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Your full name"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
            </label>

            <button type="button" onClick={() => void acceptInvite()} disabled={submitting}>
              {submitting ? "Creating account..." : "Accept Invite"}
            </button>
          </div>
        ) : null}

        {!loadingInvite && !invite ? (
          <div>
            <p className="status-text">{statusMessage || "Invite is invalid or expired."}</p>
            <button type="button" onClick={() => router.push("/")}>
              Go To Login
            </button>
          </div>
        ) : null}

        {invite && statusMessage ? <p className="status-text">{statusMessage}</p> : null}
      </section>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="dashboard-shell">
          <header className="dashboard-header">
            <h1>Accept Team Invite</h1>
            <p>Preparing your invite details...</p>
          </header>
        </div>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  );
}
