"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { 
  Loader2, 
  ArrowRight, 
  Zap, 
  CheckCircle,
  Download,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import TeamLensLogo from "../../../components/TeamLensLogo";

const ACCESS_TOKEN_STORAGE_KEY = "teamlens_access_token";

const uniqueBases = (values: Array<string | null | undefined>) =>
  [...new Set(values.map((value) => value?.trim().replace(/\/$/, "")).filter((value): value is string => Boolean(value)))];

const getRuntimeApiBases = () => {
  const envBase = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (typeof window === "undefined") {
    return uniqueBases([envBase]);
  }

  const params = new URLSearchParams(window.location.search);
  const queryBase = params.get("mobileApiBase");
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const isLocalHost = ["localhost", "127.0.0.1"].includes(hostname);

  return uniqueBases([
    queryBase,
    isLocalHost ? envBase : undefined,
    isLocalHost ? undefined : `${protocol}//${hostname}`,
    envBase,
  ]);
};

export default function ManagerSignInPage() {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");

  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [loadingAuth, setLoadingAuth] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  const apiBases = useMemo(() => getRuntimeApiBases(), []);
  const [apiBase, setApiBase] = useState(apiBases[0] ?? "");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mobileToken = params.get("mobileToken") || params.get("teamlensToken");
    const employeeId = params.get("employeeId") || "";
    const mobileApiBase = params.get("mobileApiBase") || "";
    const mobileWsBase = params.get("mobileWsBase") || "";
    let storedToken = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) ?? "";

    if (mobileToken) {
      storedToken = mobileToken;
      window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, mobileToken);
      params.delete("mobileToken");
      params.delete("teamlensToken");
      const nextSearch = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`);
    }

    const checkSession = async () => {
      for (const candidate of apiBases) {
        try {
          const res = await fetch(`${candidate}/api/web/auth/me`, {
            headers: storedToken ? { Authorization: `Bearer ${storedToken}` } : undefined,
            credentials: "include",
            cache: "no-store",
          });
          const payload = await res.json().catch(() => null);
          if (res.ok && payload?.success) {
            setApiBase(candidate);
            const nextParams = new URLSearchParams();
            if (employeeId) nextParams.set("employeeId", employeeId);
            if (mobileApiBase || candidate) nextParams.set("mobileApiBase", mobileApiBase || candidate);
            if (mobileWsBase) nextParams.set("mobileWsBase", mobileWsBase);
            router.replace(`/dashboard${employeeId ? "/live" : ""}${nextParams.toString() ? `?${nextParams.toString()}` : ""}`);
            return;
          }
        } catch {
          // Try the next base.
        }
      }
      setIsCheckingSession(false);
    };

    void checkSession();
  }, [apiBases, router]);

  const onAuthSuccess = () => {
    setStatusMessage("Synchronization complete. Access granted.");
    router.push("/dashboard");
  };

  const login = async () => {
    setLoadingAuth(true);
    setStatusMessage("");

    try {
      let response: Response | null = null;
      let payload: { success?: boolean; data?: { accessToken?: string }; message?: string } | null = null;
      for (const candidate of apiBases) {
        try {
          const candidateResponse = await fetch(`${candidate}/api/web/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ email: loginEmail, password: loginPassword }),
          });
          const candidatePayload = await candidateResponse.json().catch(() => null);
          response = candidateResponse;
          payload = candidatePayload;
          if (candidateResponse.ok && candidatePayload?.success) {
            setApiBase(candidate);
            break;
          }
        } catch {
          // Try the next base.
        }
      }

      if (response?.ok && payload?.success) {
        if (payload.data?.accessToken) {
          window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, payload.data.accessToken);
        }
        onAuthSuccess();
      } else {
        setStatusMessage(`Error: ${payload?.message ?? "Invalid credentials"}`);
        setLoadingAuth(false);
      }
    } catch {
      setStatusMessage(`Unable to connect to API. Tried: ${apiBases.join(", ")}`);
      setLoadingAuth(false);
    }
  };

  const signup = async () => {
    setLoadingAuth(true);
    setStatusMessage("");

    try {
      const response = await fetch(`${apiBase}/api/web/auth/signup-manager`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fullName: signupName,
          email: signupEmail,
          password: signupPassword,
          organizationName,
        }),
      });

      const payload = await response.json();

      if (response.ok && payload.success) {
        if (payload.data?.accessToken) {
          window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, payload.data.accessToken);
        }
        onAuthSuccess();
      } else {
        let errorMsg = payload.message || "Registration failed";
        if (payload.issues?.fieldErrors) {
          const errors = Object.values(payload.issues.fieldErrors).flat();
          if (errors.length > 0) errorMsg = String(errors[0]);
        }
        setStatusMessage(`Error: ${errorMsg}`);
        setLoadingAuth(false);
      }
    } catch {
      setStatusMessage("Network error during deployment.");
      setLoadingAuth(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authMode === "login") {
      await login();
    } else {
      await signup();
    }
  };

  if (isCheckingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 border-4 border-brand border-t-transparent rounded-full animate-spin" />
          <p className="text-[11px] font-medium text-[#8C8780] uppercase tracking-[0.2em]">TeamLens Intelligence</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background font-sans overflow-hidden">
      {/* LEFT HEMISPHERE: Intelligence Hero */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-[#2D2A26] items-center justify-center p-12 overflow-hidden">
        {/* Dynamic Gradient Mesh (AI Style) */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-40">
           <motion.div 
             animate={{ 
               x: [0, 100, -100, 0],
               y: [0, -100, 100, 0],
               scale: [1, 1.2, 0.8, 1]
             }}
             transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
             className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] rounded-full bg-brand/30 blur-[120px]" 
           />
           <motion.div 
             animate={{ 
               x: [0, -100, 100, 0],
               y: [0, 100, -100, 0],
               scale: [1, 0.8, 1.2, 1]
             }}
             transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
             className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] rounded-full bg-emerald-500/20 blur-[120px]" 
           />
           <motion.div 
             animate={{ 
               opacity: [0.1, 0.3, 0.1]
             }}
             transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
             className="absolute inset-0 opacity-20 [background-image:radial-gradient(rgba(255,255,255,0.28)_1px,transparent_1px)] [background-size:4px_4px]"
           />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-lg">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <TeamLensLogo
              compact
              className="mb-10 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-2xl shadow-brand/30"
              markClassName="scale-110"
            />
            <h1 className="text-5xl font-medium text-white tracking-tight leading-[1.1]">
              Engineered for <span className="text-brand">total visibility.</span>
            </h1>
            <p className="mt-6 text-lg text-slate-300 font-medium leading-relaxed">
              Deploying enterprise-grade surveillance to synchronize workforce activity with organizational objectives.
            </p>
            
            <div className="mt-12 space-y-4">
               {[
                 "Real-time Behavioral Analytics",
                 "Automated Productivity Intelligence",
                 "End-to-End Surveillance Pipelines"
               ].map((feature, i) => (
                 <div key={i} className="flex items-center gap-3 text-slate-200">
                    <CheckCircle className="h-5 w-5 text-emerald-400" />
                    <span className="text-sm font-medium tracking-wide">{feature}</span>
                 </div>
               ))}
            </div>
          </motion.div>
        </div>
        
        {/* Subtle Bottom Credit */}
        <div className="absolute bottom-8 left-12 flex items-center gap-2 opacity-30 group cursor-default">
           <Zap className="h-4 w-4 text-brand fill-current group-hover:scale-110 transition-transform" />
           <span className="text-[11px] font-medium text-white uppercase tracking-[0.2em]">Intelligence Platform v0.1.2</span>
        </div>
      </div>

      {/* RIGHT HEMISPHERE: Authentication Hub */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 md:p-12 xl:p-24 relative">
        <div className="w-full max-w-[400px]">
          {/* Mobile Logo */}
          <div className="lg:hidden flex flex-col items-center mb-10 text-center">
            <TeamLensLogo href="/" className="justify-center" textClassName="text-2xl" />
          </div>

          <div className="mb-10 text-left">
            <h2 className="text-3xl font-medium text-[#2D2A26] tracking-tight leading-tight">
              {authMode === "login" ? "Welcome Back" : "Start Deployment"}
            </h2>
            <p className="text-[14px] font-medium text-[#8C8780] mt-2">
              {authMode === "login" ? "Initialize organization synchronization." : "Create your command center in seconds."}
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-6">
            <AnimatePresence mode="wait">
              {authMode === "signup" && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-medium text-[#8C8780] uppercase tracking-widest ml-1">Commanding Officer</label>
                    <input
                      type="text"
                      required
                      className="w-full bg-[#FCFAF8] border border-[#E8E4DF] rounded-2xl py-4 px-5 text-[15px] font-medium placeholder:text-[#8C8780]/50 focus:bg-white focus:ring-4 focus:ring-brand/5 focus:border-brand outline-none transition-all"
                      placeholder="Full Name"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-medium text-[#8C8780] uppercase tracking-widest ml-1">Organization Alias</label>
                    <input
                      type="text"
                      required
                      className="w-full bg-[#FCFAF8] border border-[#E8E4DF] rounded-2xl py-4 px-5 text-[15px] font-medium placeholder:text-[#8C8780]/50 focus:bg-white focus:ring-4 focus:ring-brand/5 focus:border-brand outline-none transition-all"
                      placeholder="e.g. Nexus Corp"
                      value={organizationName}
                      onChange={(e) => setOrganizationName(e.target.value)}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium text-[#8C8780] uppercase tracking-widest ml-1">Access Email</label>
              <input
                type="email"
                required
                className="w-full bg-[#FCFAF8] border border-[#E8E4DF] rounded-2xl py-4 px-5 text-[15px] font-medium placeholder:text-[#8C8780]/50 focus:bg-white focus:ring-4 focus:ring-brand/5 focus:border-brand outline-none transition-all"
                placeholder="admin@workspace.com"
                value={authMode === "login" ? loginEmail : signupEmail}
                onChange={(e) => authMode === "login" ? setLoginEmail(e.target.value) : setSignupEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium text-[#8C8780] uppercase tracking-widest ml-1">Security Key</label>
              <input
                type="password"
                required
                className="w-full bg-[#FCFAF8] border border-[#E8E4DF] rounded-2xl py-4 px-5 text-[15px] font-medium placeholder:text-[#8C8780]/50 focus:bg-white focus:ring-4 focus:ring-brand/5 focus:border-brand outline-none transition-all"
                placeholder="••••••••"
                value={authMode === "login" ? loginPassword : signupPassword}
                onChange={(e) => authMode === "login" ? setLoginPassword(e.target.value) : setSignupPassword(e.target.value)}
              />
            </div>

            {statusMessage && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`p-4 rounded-2xl text-[12px] font-medium text-center border ${
                  statusMessage.startsWith("Error") 
                    ? "bg-rose-50 text-rose-600 border-rose-100" 
                    : "bg-brand/5 text-brand border-brand/10"
                }`}
              >
                {statusMessage}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loadingAuth}
              className="w-full bg-brand text-white rounded-full py-4.5 text-sm font-medium shadow-xl shadow-brand/20 hover:bg-brand-dark hover:shadow-brand/30 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 group"
            >
              {loadingAuth ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  {authMode === "login" ? "Initialize Sync" : "Deploy Platform"}
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Download Agent Button */}
          <div className="mt-8 pt-8 border-t border-[#E8E4DF] text-center">
            <p className="text-[10px] font-medium text-[#8C8780] uppercase tracking-widest mb-3">TeamLens Desktop Agent</p>
            <a
              href="/download/agent"
              className="inline-flex items-center gap-2 bg-[#FCFAF8] border border-[#E8E4DF] rounded-full py-3 px-6 text-[12px] font-medium text-[#2D2A26] hover:bg-white hover:border-brand/20 hover:text-brand transition-all group"
            >
              <Download size={14} className="group-hover:text-brand transition-colors" />
              Download Agent for Windows
            </a>
          </div>

          <div className="mt-8 text-center">
             <p className="text-[13px] font-medium text-[#8C8780]">
               {authMode === "login" ? "New to the platform?" : "Established organization?"}
               <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === "login" ? "signup" : "login");
                  setStatusMessage("");
                }}
                className="text-brand hover:text-brand-dark transition-colors uppercase tracking-[0.1em] text-[11px] ml-3"
              >
                {authMode === "login" ? "Create Account" : "Access Console"}
              </button>
             </p>
          </div>
        </div>

        {/* Global Footer cues */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-[400px] flex items-center justify-between opacity-30 px-4 pointer-events-none">
           <span className="text-[9px] font-medium text-[#8C8780] uppercase tracking-widest">Enterprise Cloud</span>
           <span className="text-[9px] font-medium text-[#8C8780] uppercase tracking-widest">TLS 1.3 Secure</span>
        </div>
      </div>
    </div>
  );
}
