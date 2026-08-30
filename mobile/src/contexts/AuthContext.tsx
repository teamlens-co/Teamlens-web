import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { api, type Bootstrap } from "@/services/api";
import { clearToken, readToken, saveToken } from "@/services/storage";
import { stopTracking } from "@/tracking/tracker";

type AuthState = {
  token: string | null;
  bootstrap: Bootstrap | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBootstrap = useCallback(async (authToken: string) => {
    const data = await api.bootstrap(authToken);
    setBootstrap(data);
  }, []);

  // Restore a stored session on launch so a field worker is not asked to log in
  // at the start of every shift.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const stored = await readToken();
      if (!stored) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        await loadBootstrap(stored);
        if (!cancelled) setToken(stored);
      } catch {
        // An expired or revoked token should not strand the app on a spinner.
        await clearToken();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadBootstrap]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError(null);
      setLoading(true);
      try {
        const result = await api.login(email.trim(), password, "TeamLens Mobile");
        await saveToken(result.token);
        await loadBootstrap(result.token);
        setToken(result.token);
      } catch (err) {
        setError((err as Error).message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [loadBootstrap],
  );

  const signOut = useCallback(async () => {
    // Tracking must stop before the token goes, or the background task will
    // keep queueing breadcrumbs it can never upload.
    await stopTracking();
    await clearToken();
    setToken(null);
    setBootstrap(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      await loadBootstrap(token);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [token, loadBootstrap]);

  const value = useMemo(
    () => ({ token, bootstrap, loading, error, signIn, signOut, refresh }),
    [token, bootstrap, loading, error, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
