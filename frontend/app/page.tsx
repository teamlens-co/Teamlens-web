"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import TeamLensLogo from "../components/TeamLensLogo";
import {
  Activity,
  CheckSquare,
  ChevronRight,
  Download,
  Globe,
  Lock,
  MessageSquare,
  Shield,
  Terminal,
  Play,
  Square,
  Users,
  LayoutDashboard,
  User,
  Settings,
  BarChart2,
} from "lucide-react";

type Role = "MANAGER" | "EMPLOYEE";

type SessionUser = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
};

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data: T;
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.14, delayChildren: 0.05 } },
};

const motionEase: [number, number, number, number] = [0.16, 1, 0.3, 1];

const fadeUp: Variants = {
  hidden: { y: 12, opacity: 0, filter: "blur(4px)" },
  visible: { y: 0, opacity: 1, filter: "blur(0px)", transition: { duration: 0.9, ease: motionEase } },
};

const cardVariantsLeft = {
  hidden: { x: -50, y: 50, rotate: 0, opacity: 0 },
  visible: { x: 0, y: 0, rotate: 0, opacity: 1, transition: { duration: 0.9, ease: motionEase } }
};

const cardVariantsRight = {
  hidden: { x: 50, y: 50, rotate: 0, opacity: 0 },
  visible: { x: 0, y: 0, rotate: 0, opacity: 1, transition: { duration: 0.9, ease: motionEase } }
};

const cardVariantsCenter = {
  hidden: { y: 60, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.9, ease: motionEase } }
};

const agentDownloadHref =
  process.env.NEXT_PUBLIC_AGENT_DOWNLOAD_URL?.trim() ||
  "/downloads/TeamLens_0.1.2_x64-setup.exe";

export default function Home() {
  const router = useRouter();
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  // Showcase Interactive State
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [activeSeconds, setActiveSeconds] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isClockedIn) {
      interval = setInterval(() => {
        setActiveSeconds(s => s + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isClockedIn]);

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const apiBase = useMemo(() => {
    const envBase = process.env.NEXT_PUBLIC_API_URL?.trim();
    return envBase && envBase.length > 0 ? envBase.replace(/\/$/, "") : "http://localhost:5000";
  }, []);

  useEffect(() => {
    const restoreSession = async () => {
      setLoadingSession(true);
      try {
        const response = await fetch(`${apiBase}/api/web/auth/me`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        const payload = (await response.json()) as ApiResponse<{
          id: string;
          fullName: string;
          email: string;
          role: Role;
        }>;

        if (!response.ok || !payload.success) {
          setSessionUser(null);
          return;
        }

        setSessionUser(payload.data);
      } catch {
        setSessionUser(null);
      } finally {
        setLoadingSession(false);
      }
    };

    void restoreSession();
  }, [apiBase]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await fetch(`${apiBase}/api/web/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      setSessionUser(null);
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-background text-[#2D2A26] selection:bg-brand/10">
      
      {/* --- HERO TOP SECTION WITH WINGS --- */}
      <div className="relative w-full overflow-hidden pb-10">
        {/* Background Fade to Warm restricted to Hero */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2 }}
          className="absolute inset-0 pointer-events-none bg-[#F3F0EC]"
        />

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,_#ffffff_28%,_transparent_68%)]" />
        
        {/* Left Wing (Bottom Up Animation) */}
        <motion.div 
          initial={{ y: "150%" }}
          animate={{ y: 0 }}
          transition={{ duration: 1.4, ease: motionEase, delay: 0.1 }}
          className="absolute -left-[12%] top-[-8%] h-[120%] w-[34%] rounded-r-[100%] bg-[#E8E4DF] shadow-[20px_0_60px_rgba(255,255,255,1)]" 
        />
        
        {/* Right Wing (Bottom Up Animation) */}
        <motion.div 
          initial={{ y: "150%" }}
          animate={{ y: 0 }}
          transition={{ duration: 1.4, ease: motionEase, delay: 0.1 }}
          className="absolute -right-[12%] top-[-8%] h-[120%] w-[34%] rounded-l-[100%] bg-[#E8E4DF] shadow-[-20px_0_60px_rgba(255,255,255,1)]" 
        />
        
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.04 }} transition={{ duration: 1, delay: 0.5 }} className="absolute bottom-12 left-10 h-48 w-48" style={{ backgroundImage: "radial-gradient(#000 2px, transparent 2px)", backgroundSize: "16px 16px" }} />
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.5 }} className="absolute right-16 top-24 h-56 w-56 rounded-full bg-[#E85A3C]/10 blur-3xl" />
      </div>

      <motion.nav 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2, ease: motionEase }}
        className="relative z-10 flex items-center justify-between px-6 pb-4 pt-8 md:px-16"
      >
        <TeamLensLogo href="/" />

        <div className="hidden items-center gap-8 text-[14px] font-medium text-[#8C8780] md:flex">
          <a href="#platform" className="transition hover:text-[#2D2A26]">Platform</a>
          <a href="#security" className="transition hover:text-[#2D2A26]">Security</a>
          <a href="#deploy" className="transition hover:text-[#2D2A26]">Download Agent</a>
          <a href="#manager" className="transition hover:text-[#2D2A26]">Manager Sign In</a>
        </div>

        <div className="flex items-center gap-3">
          {sessionUser ? (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="rounded-full border border-[#E8E4DF] bg-white/80 px-5 py-2.5 text-sm font-medium text-[#2D2A26] shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signingOut ? "Signing out..." : "Sign out"}
            </button>
          ) : (
            <Link
              href="/manager/sign-in"
              className="rounded-full border border-[#E8E4DF] bg-white/80 px-5 py-2.5 text-sm font-medium text-[#2D2A26] shadow-sm transition hover:bg-white"
            >
              Sign in
            </Link>
          )}

          <Link
            href="/manager/sign-in"
            className="rounded-full bg-[#E85A3C] px-6 py-2.5 text-sm font-medium text-white shadow-[0_10px_20px_rgba(232,90,60,0.14)] transition hover:bg-[#D44D30]"
          >
            {sessionUser ? "Open workspace" : "Book demo"}
          </Link>
        </div>
      </motion.nav>

      {/* Hero Content Only */}
      <div className="relative z-10 w-full mx-auto pt-10 pb-20 px-6 text-center">
        <motion.div initial="hidden" animate="visible" variants={containerVariants}>
          <motion.h1
            variants={fadeUp}
            className="text-[56px] md:text-[76px] leading-[1.1] font-medium tracking-[-0.03em] text-[#2D2A26] mb-5"
          >
            Visibility. Control. Scale.
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="max-w-[620px] mx-auto text-[16px] md:text-[18px] text-[#8C8780] leading-relaxed mb-8 font-normal"
          >
            Now AI can monitor your team. TeamLens provides deep visibility into productivity patterns, tracking app usage and idle time to help you build highly efficient workflows.
          </motion.p>

          <motion.div variants={fadeUp} className="mt-8 mb-12 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/manager/sign-in"
              className="inline-flex items-center gap-2 rounded-full bg-[#E85A3C] px-7 py-3.5 text-sm font-medium text-white shadow-[0_16px_36px_rgba(232,90,60,0.18)] transition hover:-translate-y-0.5 hover:bg-[#D44D30]"
            >
              <Lock size={16} />
              Manager sign in
            </Link>
            <a
              href={agentDownloadHref}
              className="inline-flex items-center gap-2 rounded-full border border-[#E8E4DF] bg-white/80 px-7 py-3.5 text-sm font-medium text-[#2D2A26] shadow-[0_10px_24px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 hover:bg-white"
            >
              <Download size={16} />
              Download agent
            </a>
          </motion.div>

          <motion.div variants={fadeUp} className="flex items-center justify-center gap-[18px] mb-12 text-[#E8E4DF]">
            <div className="w-1.5 h-1.5 rounded-full bg-current" />
            <div className="w-1.5 h-1.5 rounded-full bg-current" />
            <div className="w-9 h-9 rounded-full bg-white shadow-[0_2px_15px_rgba(0,0,0,0.06)] flex items-center justify-center text-[#8C8780] z-10 transition hover:scale-110">
              <Shield size={15} />
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-current" />
            <div className="w-1.5 h-1.5 rounded-full bg-current" />
          </motion.div>

          {/* Cards Tilted Floating Layout */}
          <div className="relative max-w-[1100px] w-full h-[500px] mx-auto flex items-center justify-center perspective-[2000px] mt-8 lg:scale-100 scale-90 origin-top">
            
            {/* Left Card: Focus Score (Tilted Left on Hover) */}
            <motion.div variants={cardVariantsLeft} whileHover={{ rotate: -8, zIndex: 30, scale: 1.02 }} style={{ transformOrigin: "bottom right" }} className="absolute left-[2%] lg:left-[5%] top-10 bg-white/90 backdrop-blur-xl p-[30px] rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.08)] border border-white h-[320px] w-[310px] text-left overflow-hidden flex flex-col justify-start z-10 cursor-pointer">
              <div className="relative z-10 w-max bg-[#F3F0EC] text-[#8C8780] text-[11px] font-medium tracking-wide px-3.5 py-1.5 rounded-full mb-6 uppercase">
                Productivity Score
              </div>
              <h3 className="text-[44px] font-medium tracking-[-0.02em] text-[#2D2A26] mb-2 leading-none">92.5%</h3>
              <p className="text-[12px] text-[#8C8780] font-medium leading-[1.6]">
                Average active time:<br/>
                <span className="text-emerald-600 font-medium text-[13px]">+3.2 hrs this week</span>
              </p>
              
              {/* Decorative Chart SVG */}
              <div className="absolute bottom-[-10px] right-[-10%] w-[120%] h-[55%] pointer-events-none">
                <svg viewBox="0 0 100 50" className="w-full h-full" preserveAspectRatio="none">
                  {/* Faint shadow line */}
                  <path d="M 0 50 Q 15 45 30 35 T 50 40 T 70 20 T 80 30 T 90 10 T 100 20" fill="none" stroke="#E8E4DF" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
                  {/* Main stroke */}
                  <path d="M 0 45 Q 15 40 30 25 T 50 35 T 70 10 T 80 20 T 90 5 T 100 15" fill="none" stroke="#E85A3C" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                </svg>
              </div>
            </motion.div>

            {/* Right Card: Smart Insights (Tilted Right on Hover) */}
            <motion.div variants={cardVariantsRight} whileHover={{ rotate: 8, zIndex: 30, scale: 1.02 }} style={{ transformOrigin: "bottom left" }} className="absolute right-[2%] lg:right-[5%] top-10 bg-white/90 backdrop-blur-xl p-[30px] rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.08)] border border-white h-[320px] w-[310px] overflow-hidden flex flex-col justify-between z-10 cursor-pointer">
              {/* Top left Icon & Ripples */}
              <div className="absolute top-6 left-6 z-10">
                 <div className="w-[22px] h-[22px] bg-[#E85A3C] rounded-[6px] flex items-center justify-center shadow-sm">
                    <div className="w-2.5 h-2.5 bg-white/90 rounded-[2px] animate-pulse" />
                 </div>
              </div>
              <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-[0.03] z-0">
                <div className="absolute top-[-25%] left-[-25%] w-[60%] h-[60%] border-[24px] border-[#2D2A26] rounded-full" />
                <div className="absolute top-[-45%] left-[-45%] w-[100%] h-[100%] border-[24px] border-[#2D2A26] rounded-full" />
                <div className="absolute top-[-65%] left-[-65%] w-[140%] h-[140%] border-[24px] border-[#2D2A26] rounded-full" />
              </div>

              <div className="flex flex-col gap-3 mt-10 w-full items-end z-10 relative">
                {/* Chat bubble 1 */}
                <div className="bg-[#F3F0EC] text-[#5C5854] text-[10px] px-3.5 py-[10px] rounded-[14px] rounded-tr-[4px] w-[85%] text-left relative transform rotate-[2deg]">
                  Are there any burnout risks?
                  <svg className="absolute -left-6 top-5 w-6 h-6 text-[#E8E4DF] pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                     <path d="M20 5 Q10 10 5 20" />
                  </svg>
                </div>
                {/* Chat bubble 2 */}
                <div className="bg-[#FEF0ED] text-[#E85A3C] font-medium border border-[#E8E4DF] text-[10px] px-3.5 py-[10px] rounded-[14px] rounded-br-[4px] w-[95%] text-left relative transform -rotate-[1deg] shadow-sm ml-auto mr-0">
                  Sales team shows excessive after-hours activity.
                  <svg className="absolute -left-8 -bottom-2 w-8 h-8 text-[#FEF0ED] pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                     <path d="M15 0 Q5 10 2 20" />
                  </svg>
                </div>
                {/* Chat bubble 3 */}
                <div className="bg-white border border-[#F3F0EC] text-[#5C5854] text-[10px] px-3.5 py-[10px] rounded-[14px] rounded-bl-[4px] w-[75%] shadow-[0_2px_10px_rgba(0,0,0,0.03)] self-start mt-1 relative transform rotate-[1deg]">
                  Unproductive time reduced by 14%.
                </div>
              </div>

              <div className="flex items-center justify-between z-10 mt-auto text-left gap-4">
                <p className="text-[12px] text-[#2D2A26] font-medium leading-[1.3] max-w-[75%] pr-1">
                  Actionable insights to optimize workforce performance.
                </p>
                <button className="w-8 h-8 shrink-0 rounded-[10px] bg-[#F3F0EC] flex items-center justify-center text-[#2D2A26] hover:bg-[#E8E4DF] transition">
                  <ChevronRight size={16} />
                </button>
              </div>
            </motion.div>

            {/* Center Card: Connect Sources (Straight, Overlapping) */}
            <motion.div variants={cardVariantsCenter} whileHover={{ y: -10, zIndex: 30, scale: 1.02 }} className="absolute z-20 bg-white/90 backdrop-blur-xl px-8 pt-8 pb-6 rounded-[3rem] shadow-[0_30px_70px_-15px_rgba(0,0,0,0.1)] border border-white h-[400px] w-[380px] flex flex-col items-center justify-start overflow-hidden cursor-pointer">
              <h4 className="text-[20px] font-medium text-[#2D2A26] mb-2 z-10 mt-2">Track app usage</h4>
              
              {/* Sunburst background */}
              <div className="absolute top-[35%] left-0 w-full h-[65%] flex justify-center opacity-[0.04] pointer-events-none">
                <svg viewBox="0 0 200 100" className="w-[150%] h-[150%] origin-bottom">
                  {[20, 50, 80, 100, 130, 160].map((angle, i) => (
                    <line key={i} x1="100" y1="100" x2={100 + 100 * Math.cos(angle * Math.PI / 180)} y2={100 - 100 * Math.sin(angle * Math.PI / 180)} stroke="black" strokeWidth="0.5" />
                  ))}
                </svg>
              </div>

              {/* The "Arc" horizon */}
              <div className="absolute bottom-[90px] w-[130%] h-[60%] bg-gradient-to-b from-[#FCFAF8] to-white rounded-[100%] shadow-[inset_0_5px_15px_rgba(255,255,255,1),_0_-10px_30px_rgba(0,0,0,0.03)] flex justify-center items-start border-t border-white" />

              {/* Application Tracking Icons positioned on the arc */}
              {/* Slack / Chat app representation */}
              <div className="absolute bottom-[170px] left-[15%] w-[52px] h-[52px] bg-[#4A154B] rounded-full flex flex-col items-center justify-center text-white shadow-[0_10px_20px_rgba(74,21,75,0.3)] hover:scale-110 transition cursor-pointer">
                 <MessageSquare size={22} strokeWidth={2} />
              </div>
              
              {/* Jira / Project Tracker representation */}
              <div className="absolute bottom-[205px] left-[33%] w-[48px] h-[48px] bg-[#0052CC] rounded-full flex items-center justify-center text-white shadow-[0_10px_20px_rgba(0,82,204,0.3)] hover:scale-110 transition cursor-pointer">
                 <CheckSquare size={20} strokeWidth={2.5} />
              </div>
              
              {/* Internal / Web representation */}
              <div className="absolute bottom-[205px] right-[33%] w-[48px] h-[48px] bg-[#E85A3C] rounded-full flex items-center justify-center text-white shadow-[0_10px_20px_rgba(232,90,60,0.3)] hover:scale-110 transition cursor-pointer border border-[#D44D30]">
                 <Globe size={22} strokeWidth={2} />
              </div>
              
              {/* Dev / Terminal representation */}
              <div className="absolute bottom-[170px] right-[15%] w-[58px] h-[58px] bg-[#2D2A26] rounded-full flex items-center justify-center text-white shadow-[0_10px_20px_rgba(45,42,38,0.3)] hover:scale-110 transition cursor-pointer">
                 <Terminal size={24} strokeWidth={2.5} />
              </div>

              {/* Install Agent Button */}
              <div className="absolute bottom-8 w-full flex justify-center z-20">
                <a 
                  href={agentDownloadHref}
                  className="bg-[#E85A3C] text-white px-[24px] py-[12px] rounded-[1.3rem] flex items-center gap-[12px] hover:bg-[#D44D30] transition shadow-[0_10px_20px_rgba(232,90,60,0.15)]"
                >
                  <Download size={20} className="text-white/90" strokeWidth={2.5} />
                  <div className="text-left leading-none mt-px">
                    <p className="text-[10px] text-white/70 mb-[4px] font-medium tracking-wide">Stealth or Visible mode</p>
                    <p className="text-[15px] font-medium tracking-wide">Deploy Agent</p>
                  </div>
                </a>
              </div>
            </motion.div>

          </div>
        </motion.div>
      </div>

      {/* Fade the very bottom of the hero into the pure white page body cleanly */}
      <div className="absolute bottom-0 left-0 w-full h-40 bg-gradient-to-t from-[rgba(248,245,241,1)] to-[rgba(248,245,241,0)] pointer-events-none z-10 hidden lg:block" />
      
      </div> {/* Close HERO TOP SECTION WITH WINGS wrapper */}

      {/* --- PURE WHITE PAGE BODY BELOW HERO --- */}
      <main className="relative z-10 w-full mx-auto pb-20 text-center bg-background">
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={containerVariants} id="showcase" className="mt-24 space-y-32">
          {/* Employee App Feature */}
          <motion.div variants={fadeUp} className="flex flex-col lg:flex-row items-center gap-16 lg:gap-8 px-4 max-w-[1000px] mx-auto">
             <div className="lg:w-1/2 text-left">
                <div className="mb-6 inline-flex rounded-full bg-[#FEF0ED] px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[#E85A3C] ring-1 ring-inset ring-[#E85A3C]/20">
                  For Employees
                </div>
                <h2 className="text-3xl font-medium tracking-tight text-[#2D2A26] sm:text-[42px] leading-[1.1]">
                  Simplicity at work.
                </h2>
                <p className="mt-6 text-lg leading-8 text-[#8C8780]">
                  The desktop agent stays quietly out of the way. When it&apos;s time to work, a single click starts the session.
                  No complicated tracking boards, no intrusive cameras. Just clear intent.
                </p>
             </div>
             
             <div className="lg:w-1/2 flex justify-center lg:justify-end">
                {/* Desktop App Mockup */}
                <div className="relative w-full max-w-[340px] bg-white rounded-3xl overflow-hidden shadow-[0_30px_70px_-15px_rgba(0,0,0,0.1),0_0_0_1px_rgba(0,0,0,0.05)] border border-[#E8E4DF]/50">
                    {/* App Header */}
                    <div className="bg-[#FCFAF8] px-4 py-3 flex items-center justify-between border-b border-[#E8E4DF]">
                        <div className="flex gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
                            <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
                            <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
                        </div>
                        <div className="text-[11px] font-medium tracking-[0.05em] text-[#8C8780] uppercase">TeamLens Agent</div>
                        <div className="w-10"></div>
                    </div>
                    {/* App Body */}
                    <div className="p-6 flex flex-col items-center">
                        <div className="relative mb-4">
                            <div className="w-[68px] h-[68px] rounded-full bg-[#F3F0EC] border-4 border-white shadow-sm flex items-center justify-center text-[#8C8780]">
                                <User size={28} />
                            </div>
                            <div className={`absolute bottom-1 right-0 w-4 h-4 rounded-full border-2 border-white transition-colors duration-300 ${isClockedIn ? 'bg-emerald-500' : 'bg-[#8C8780]'}`} />
                        </div>
                        <h3 className="text-lg font-medium text-[#2D2A26]">Alex Carter</h3>
                        <p className="text-sm font-medium text-[#8C8780]">Engineering Team</p>

                        <div className={`w-full mt-8 rounded-2xl p-5 border relative overflow-hidden transition-colors duration-500 ${isClockedIn ? 'bg-[#FEF0ED]/30 border-[#FEF0ED]/50' : 'bg-[#FCFAF8] border-[#E8E4DF]'}`}>
                           <div className="text-center relative z-10">
                               <p className="text-[10px] font-medium uppercase tracking-widest text-[#8C8780] mb-1">Session Time</p>
                               <div className="text-[38px] font-medium tracking-tight text-[#2D2A26] font-mono tabular-nums leading-none">
                                   {formatTime(activeSeconds)}
                               </div>
                           </div>
                        </div>

                        <div className="w-full mt-6">
                            <button
                                onClick={() => setIsClockedIn(!isClockedIn)}
                                className={`w-full h-14 rounded-2xl flex items-center justify-center gap-2 font-medium text-[15px] transition-all duration-300 shadow-sm ${
                                  isClockedIn 
                                  ? 'bg-[#FEF0ED] text-[#E85A3C] border border-[#FEF0ED] hover:bg-[#FEF0ED]' 
                                  : 'bg-[#E85A3C] text-white hover:bg-[#D44D30] shadow-[0_10px_20px_rgba(232,90,60,0.2)]'
                                }`}
                            >
                                {isClockedIn ? (
                                    <><Square size={16} className="fill-current" /> Stop Tracking</>
                                ) : (
                                    <><Play size={16} className="fill-current" /> Clock In</>
                                )}
                            </button>
                        </div>
                        
                        <div className="w-full mt-6 pt-5 border-t border-[#E8E4DF]">
                           <div className="flex items-center justify-between text-xs font-medium">
                               <span className="text-[#8C8780] flex items-center gap-1.5"><Activity size={14}/> Activity Log</span>
                               {isClockedIn ? <span className="text-[#E85A3C]">Tracking active</span> : <span className="text-[#8C8780]">Idle</span>}
                           </div>
                           <div className="mt-3 space-y-2">
                               <div className="flex gap-2 items-center text-[11px] text-[#5C5854]">
                                   <div className={`w-5 h-5 rounded flex items-center justify-center text-white ${isClockedIn ? 'bg-[#E85A3C]' : 'bg-[#E8E4DF]'}`}>
                                      <CheckSquare size={10}/>
                                   </div>
                                   <span className="flex-1 truncate">Jira - TEAM-402</span>
                                   <span>Active</span>
                               </div>
                           </div>
                        </div>
                    </div>
                </div>
             </div>
          </motion.div>

          {/* Manager Dashboard Feature */}
          <motion.div variants={fadeUp} className="flex flex-col-reverse lg:flex-row items-center gap-16 min-w-0 max-w-[1200px] mx-auto px-4 mt-16 pb-10">
             <div className="lg:w-3/5 w-full">
                {/* Modern Dashboard Mockup */}
                <div className="w-full bg-[#FCFAF8] rounded-[2rem] overflow-hidden shadow-[0_30px_80px_-20px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.05)] border border-[#E8E4DF]/60 flex h-[500px]">
                   {/* Sidebar */}
                   <div className="w-[70px] bg-[#2D2A26] flex flex-col items-center py-6 gap-8 shrink-0">
                       <Shield size={28} className="text-white" />
                       <div className="flex flex-col gap-6 text-[#8C8780]">
                           <LayoutDashboard size={20} className="text-white" />
                           <Users size={20} />
                           <BarChart2 size={20} />
                           <Settings size={20} />
                       </div>
                   </div>
                   {/* Main Content */}
                   <div className="flex-1 flex flex-col min-w-0">
                       <div className="h-[70px] border-b border-[#E8E4DF] bg-white px-8 flex items-center justify-between shadow-sm relative z-10 shrink-0">
                           <h2 className="text-[15px] font-medium text-[#2D2A26]">Team Overview</h2>
                           <div className="flex items-center gap-4">
                               <div className="px-3 py-1.5 bg-[#FEF0ED] text-[#E85A3C] text-[10px] font-medium tracking-wider rounded-lg border border-[#FEF0ED] flex items-center gap-1.5">
                                 <span className="w-1.5 h-1.5 rounded-full bg-[#E85A3C] animate-pulse"/>
                                 LIVE SYNC
                               </div>
                               <div className="w-8 h-8 rounded-full bg-[#F3F0EC]" />
                           </div>
                       </div>
                       <div className="p-6 md:p-8 flex-1 overflow-y-auto flex flex-col gap-6 bg-[#FCFAF8]">
                           {/* KPIs */}
                           <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
                               <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#E8E4DF] relative overflow-hidden">
                                   <div className="text-[#8C8780] text-[10px] font-medium tracking-wider mb-1">TEAM FOCUS SC.</div>
                                   <div className="text-2xl font-medium text-[#2D2A26]">92.4%</div>
                                   <div className="mt-1 text-xs text-emerald-500 font-medium">+2.1% this week</div>
                                   <div className="absolute right-[-10px] bottom-[-10px] text-[#FCFAF8] opacity-50"><Activity size={60} strokeWidth={3}/></div>
                               </div>
                               <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#E8E4DF]">
                                   <div className="text-[#8C8780] text-[10px] font-medium tracking-wider mb-1">ACTIVE AGENTS</div>
                                   <div className="text-2xl font-medium text-[#2D2A26]">24 <span className="text-[14px] text-[#8C8780] font-medium">/ 28</span></div>
                                   <div className="mt-3 h-1.5 w-full bg-[#F3F0EC] rounded-full overflow-hidden flex">
                                       <div className="w-[85%] bg-emerald-400 h-full rounded-full" />
                                   </div>
                               </div>
                               <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#E8E4DF]">
                                   <div className="text-[#8C8780] text-[10px] font-medium tracking-wider mb-1">BURNOUT ALERTS</div>
                                   <div className="flex items-center gap-2 mt-0.5">
                                       <div className="text-2xl font-medium text-[#E85A3C]">2</div>
                                       <div className="px-2 py-0.5 bg-[#FEF0ED] border border-[#FEF0ED] text-[#E85A3C] text-[10px] rounded-md font-medium font-mono">HIGH</div>
                                   </div>
                               </div>
                           </div>
                           
                           {/* Data Table */}
                           <div className="bg-white flex-1 rounded-2xl shadow-sm border border-[#E8E4DF] overflow-hidden flex flex-col">
                               <div className="px-5 py-3 border-b border-[#E8E4DF] bg-[#FCFAF8]/50 flex text-[10px] font-medium text-[#8C8780] tracking-wider items-center shrink-0">
                                   <div className="flex-[2] min-w-0">EMPLOYEE</div>
                                   <div className="flex-1 min-w-0">STATUS</div>
                                   <div className="flex-[1.5] min-w-0 hidden md:block">CURRENT APP</div>
                                   <div className="flex-1 text-right min-w-0">TODAY</div>
                               </div>
                               <div className="flex flex-col overflow-y-auto">
                                   <div className="px-5 py-3 border-b border-[#F3F0EC] flex items-center hover:bg-[#FCFAF8] transition cursor-default">
                                       <div className="flex-[2] flex items-center gap-3 min-w-0">
                                           <div className="w-7 h-7 rounded-full bg-brand/10 text-brand flex items-center justify-center font-medium text-[10px] shrink-0">AC</div>
                                           <span className="text-sm font-medium text-[#2D2A26] truncate pr-2">Alex Carter</span>
                                       </div>
                                       <div className="flex-1 flex items-center gap-1.5 min-w-0">
                                           <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"/>
                                           <span className="text-[11px] font-medium text-emerald-600">Active</span>
                                       </div>
                                       <div className="flex-[1.5] hidden md:flex items-center gap-2 min-w-0 pr-2">
                                           <div className="w-[18px] h-[18px] rounded flex items-center justify-center bg-[#E85A3C] text-white shrink-0"><CheckSquare size={10}/></div>
                                           <span className="text-[11px] font-medium text-[#5C5854] truncate">Jira</span>
                                       </div>
                                       <div className="flex-1 text-right text-[11px] font-medium text-[#5C5854] font-mono">
                                           {formatTime(activeSeconds > 0 ? activeSeconds + 22440 : 22440)}
                                       </div>
                                   </div>
                                   
                                   <div className="px-5 py-3 border-b border-[#F3F0EC] flex items-center hover:bg-[#FCFAF8] transition cursor-default">
                                       <div className="flex-[2] flex items-center gap-3 min-w-0">
                                           <div className="w-7 h-7 rounded-full bg-brand/10 text-brand flex items-center justify-center font-medium text-[10px] shrink-0">SJ</div>
                                           <span className="text-sm font-medium text-[#2D2A26] truncate pr-2">Sarah Jenkins</span>
                                       </div>
                                       <div className="flex-1 flex items-center gap-1.5 min-w-0">
                                           <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"/>
                                           <span className="text-[11px] font-medium text-amber-600 truncate">Idle (12m)</span>
                                       </div>
                                       <div className="flex-[1.5] hidden md:flex items-center gap-2 min-w-0 pr-2">
                                           <div className="w-[18px] h-[18px] rounded bg-[#2D2A26] flex items-center justify-center text-white shrink-0"><Terminal size={10}/></div>
                                           <span className="text-[11px] font-medium text-[#5C5854] truncate">VS Code</span>
                                       </div>
                                       <div className="flex-1 text-right text-[11px] font-medium text-[#5C5854] font-mono">05:22:10</div>
                                   </div>

                                   <div className="px-5 py-3 flex items-center hover:bg-[#FCFAF8] transition cursor-default opacity-60">
                                       <div className="flex-[2] flex items-center gap-3 min-w-0">
                                           <div className="w-7 h-7 rounded-full bg-[#F3F0EC] text-[#8C8780] flex items-center justify-center font-medium text-[10px] shrink-0">MR</div>
                                           <span className="text-sm font-medium text-[#2D2A26] truncate pr-2">Marcus Reed</span>
                                       </div>
                                       <div className="flex-1 flex items-center gap-1.5 min-w-0">
                                           <div className="w-1.5 h-1.5 rounded-full border border-[#E8E4DF] shrink-0"/>
                                           <span className="text-[11px] font-medium text-[#8C8780]">Offline</span>
                                       </div>
                                       <div className="flex-[1.5] hidden md:flex items-center gap-2 min-w-0 pr-2">
                                           <span className="text-[11px] font-medium text-[#8C8780] truncate">-</span>
                                       </div>
                                       <div className="flex-1 text-right text-[11px] font-medium text-[#5C5854] font-mono">08:00:20</div>
                                   </div>
                               </div>
                           </div>
                       </div>
                   </div>
                </div>
             </div>

             <div className="lg:w-2/5 text-left lg:pl-4">
                <div className="mb-6 inline-flex rounded-full bg-[#FEF0ED] px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[#E85A3C] ring-1 ring-inset ring-[#E85A3C]/20">
                  For Managers
                </div>
                <h2 className="text-3xl font-medium tracking-tight text-[#2D2A26] sm:text-[42px] leading-[1.1]">
                  Deep insights.<br/>Actionable clarity.
                </h2>
                <p className="mt-6 text-lg leading-8 text-[#8C8780]">
                  Access an overarching control plane to monitor workforce health instantly. 
                  View exactly what apps are driving focus, spot productivity drains, and detect burnout risks before they happen.
                </p>
             </div>
          </motion.div>
        </motion.section>

        <motion.section variants={fadeUp} id="deploy" className="mt-32 max-w-[1200px] mx-auto relative overflow-hidden rounded-[3rem] border border-[#E8E4DF] bg-white px-6 py-20 text-center shadow-[0_24px_70px_rgba(0,0,0,0.05)] md:px-16">
          <div className="relative z-10 max-w-4xl mx-auto">
              <div className="mb-6 inline-flex rounded-full bg-[#FCFAF8] px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[#8C8780] ring-1 ring-inset ring-[#E8E4DF]">
                Agent Deployment
              </div>
              <h2 className="text-3xl font-medium tracking-tight text-[#2D2A26] sm:text-5xl leading-[1.1] mb-6">
                Zero-friction installation.
              </h2>
              <p className="max-w-2xl mx-auto text-[16px] leading-[1.6] text-[#8C8780]">
                The desktop agent is distributed natively. One click deployment securely binds the agent to your workspace organization token, keeping managers in complete control.
              </p>
              
              <div className="mt-12 mb-16 flex flex-col sm:flex-row items-center justify-center gap-4">
                  <a
                    href={agentDownloadHref}
                    className="inline-flex items-center gap-2 rounded-full bg-[#E85A3C] px-8 py-4 text-[14px] font-medium text-white transition hover:bg-[#D44D30] shadow-[0_10px_30px_rgba(232,90,60,0.2)]"
                  >
                    <Download size={18} className="text-white" />
                    Download Mac/Win Agent
                  </a>
                  <Link
                    href="/manager/sign-in"
                    className="inline-flex items-center gap-2 rounded-full bg-transparent border border-[#E8E4DF] px-8 py-4 text-[14px] font-medium text-[#2D2A26] transition hover:bg-[#FCFAF8]"
                  >
                    <Shield size={18} className="#8C8780" />
                    Generate access token
                  </Link>
              </div>

              {/* Install Flow Steps */}
              <div className="grid sm:grid-cols-3 gap-8 pt-12 border-t border-[#E8E4DF] text-left">
                  <div className="flex flex-col gap-4">
                      <div className="w-12 h-12 rounded-full bg-[#FCFAF8] flex items-center justify-center text-[#8C8780] border border-[#E8E4DF] shadow-sm font-medium">1</div>
                      <h4 className="text-[15px] font-medium text-[#2D2A26]">Manager signs in</h4>
                      <p className="text-[13px] text-[#8C8780] leading-relaxed pr-4">Access the portal and generate a highly secure, one-time organization token.</p>
                  </div>
                  <div className="flex flex-col gap-4">
                      <div className="w-12 h-12 rounded-full bg-[#FEF0ED] flex items-center justify-center text-[#E85A3C] border border-[#E85A3C]/20 shadow-[0_0_20px_rgba(232,90,60,0.1)] font-medium">2</div>
                      <h4 className="text-[15px] font-medium text-[#E85A3C]">Agent connects</h4>
                      <p className="text-[13px] text-[#8C8780] leading-relaxed pr-4">The employee installs the agent which instantly resolves to the correct workspace via the token.</p>
                  </div>
                  <div className="flex flex-col gap-4">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)] font-medium">3</div>
                      <h4 className="text-[15px] font-medium text-[#2D2A26]">Capture begins</h4>
                      <p className="text-[13px] text-[#8C8780] leading-relaxed pr-4">Rich activity analytics and idle time immediately start streaming into the manager console.</p>
                  </div>
              </div>
          </div>
        </motion.section>

        <section id="manager" className="mt-16 text-center">
          <p className="text-[11px] font-medium tracking-[0.28em] text-[#8C8780]">READY FOR MANAGERS</p>
          <h2 className="mt-4 text-3xl font-medium tracking-[-0.04em] text-[#2D2A26] md:text-5xl">
            Sign in to manage the team console.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#8C8780] md:text-[15px]">
            If you already have a workspace, continue to the manager portal. If not, use the same route to create one and start the deployment flow.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/manager/sign-in"
              className="inline-flex items-center gap-2 rounded-full bg-[#E85A3C] px-7 py-3.5 text-sm font-medium text-white shadow-[0_16px_36px_rgba(232,90,60,0.18)] transition hover:-translate-y-0.5 hover:bg-[#D44D30]"
            >
              <Lock size={16} />
              Manager sign in
            </Link>
            <a
              href={agentDownloadHref}
              className="inline-flex items-center gap-2 rounded-full border border-[#E8E4DF] bg-white/80 px-7 py-3.5 text-sm font-medium text-[#2D2A26] shadow-[0_10px_24px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 hover:bg-white"
            >
              <Download size={16} />
              Download agent
            </a>
          </div>
        </section>

        {sessionUser ? (
          <div className="mt-8 text-center text-sm text-slate-500">
            {loadingSession ? "Loading your session..." : `Signed in as ${sessionUser.fullName}`}
          </div>
        ) : null}
      </main>
    </div>
  );
}
