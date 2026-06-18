"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Monitor, Laptop, ShieldCheck, Cpu } from "lucide-react";
import { useEffect } from "react";

interface AgentDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  windowsDownloadUrl: string;
  windowsMsiDownloadUrl?: string;
}

export default function AgentDownloadModal({
  isOpen,
  onClose,
  windowsDownloadUrl,
  windowsMsiDownloadUrl,
}: AgentDownloadModalProps) {
  const msiDownloadUrl =
    windowsMsiDownloadUrl ||
    `${windowsDownloadUrl}${windowsDownloadUrl.includes("?") ? "&" : "?"}type=msi`;
  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-[#2D2A26]/80 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
            className="relative z-10 w-full max-w-[500px] overflow-hidden bg-white/90 dark:bg-[#2D2A26]/95 border border-[#E8E4DF] dark:border-[#5C5854]/30 rounded-[2.5rem] shadow-2xl p-8 text-left"
          >
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="inline-flex rounded-full bg-[#FEF0ED] px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[#E85A3C] ring-1 ring-inset ring-[#E85A3C]/20 mb-3">
                  Downloads
                </span>
                <h3 className="text-2xl font-semibold text-[#2D2A26] dark:text-white tracking-tight leading-tight">
                  Deploy TeamLens Agent
                </h3>
                <p className="text-[13px] font-normal text-[#8C8780] mt-1.5 leading-relaxed">
                  Choose your operating system to download the native desktop employee tracker client.
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-[#F3F0EC] dark:bg-[#5C5854]/20 flex items-center justify-center text-[#5C5854] dark:text-slate-300 hover:bg-[#E8E4DF] dark:hover:bg-[#5C5854]/40 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Platform Selection List */}
            <div className="space-y-4">
              {/* WINDOWS EXE (Active) */}
              <a
                href={windowsDownloadUrl}
                onClick={onClose}
                download
                className="flex items-center gap-5 p-5 bg-[#FCFAF8] hover:bg-[#FEF0ED]/30 dark:bg-white/5 dark:hover:bg-[#E85A3C]/10 border border-[#E8E4DF] dark:border-[#5C5854]/20 hover:border-[#E85A3C]/30 rounded-3xl transition-all group cursor-pointer"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#E85A3C]/10 dark:bg-[#E85A3C]/20 text-[#E85A3C] flex items-center justify-center shrink-0">
                  <Monitor size={22} className="group-hover:scale-110 transition-transform" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[15px] text-[#2D2A26] dark:text-white">
                      Download for Windows (.exe)
                    </span>
                    <span className="px-2 py-0.5 bg-[#E85A3C]/10 text-[#E85A3C] text-[9px] font-bold rounded-md font-mono">
                      Latest
                    </span>
                  </div>
                  <p className="text-[12px] text-[#8C8780] mt-0.5 truncate">
                    Standard Setup Executable for Windows 10/11 x64
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-white dark:bg-white/5 border border-[#E8E4DF] dark:border-[#5C5854]/20 flex items-center justify-center text-[#8C8780] dark:text-slate-300 group-hover:bg-[#E85A3C] group-hover:text-white group-hover:border-[#E85A3C] transition-all">
                  <Download size={16} />
                </div>
              </a>

              {/* WINDOWS MSI (Active) */}
              <a
                href={msiDownloadUrl}
                onClick={onClose}
                download
                className="flex items-center gap-5 p-5 bg-[#FCFAF8] hover:bg-[#FEF0ED]/30 dark:bg-white/5 dark:hover:bg-[#E85A3C]/10 border border-[#E8E4DF] dark:border-[#5C5854]/20 hover:border-[#E85A3C]/30 rounded-3xl transition-all group cursor-pointer"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#E85A3C]/10 dark:bg-[#E85A3C]/20 text-[#E85A3C] flex items-center justify-center shrink-0">
                  <Monitor size={22} className="group-hover:scale-110 transition-transform" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[15px] text-[#2D2A26] dark:text-white">
                      Download for Windows (.msi)
                    </span>
                    <span className="px-2 py-0.5 bg-[#E85A3C]/10 text-[#E85A3C] text-[9px] font-bold rounded-md font-mono">
                      Latest
                    </span>
                  </div>
                  <p className="text-[12px] text-[#8C8780] mt-0.5 truncate">
                    Enterprise Installer for Windows 10/11 x64
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-white dark:bg-white/5 border border-[#E8E4DF] dark:border-[#5C5854]/20 flex items-center justify-center text-[#8C8780] dark:text-slate-300 group-hover:bg-[#E85A3C] group-hover:text-white group-hover:border-[#E85A3C] transition-all">
                  <Download size={16} />
                </div>
              </a>

              {/* MACOS (Coming Soon) */}
              <div className="flex items-center gap-5 p-5 bg-[#FCFAF8]/40 dark:bg-white/2 border border-[#E8E4DF]/60 dark:border-[#5C5854]/10 rounded-3xl opacity-50 relative overflow-hidden select-none">
                <div className="w-12 h-12 rounded-2xl bg-[#8C8780]/10 text-[#8C8780] flex items-center justify-center shrink-0">
                  <Laptop size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[15px] text-[#8C8780] dark:text-slate-400">
                      Download for macOS
                    </span>
                    <span className="px-2 py-0.5 bg-[#8C8780]/10 text-[#8C8780] text-[9px] font-bold rounded-md uppercase tracking-wide">
                      Soon
                    </span>
                  </div>
                  <p className="text-[12px] text-[#8C8780]/80 mt-0.5">
                    Apple Silicon / Intel package
                  </p>
                </div>
                <div className="text-[11px] font-semibold text-[#8C8780] uppercase tracking-wider font-mono">
                  coming soon
                </div>
              </div>

              {/* LINUX (Coming Soon) */}
              <div className="flex items-center gap-5 p-5 bg-[#FCFAF8]/40 dark:bg-white/2 border border-[#E8E4DF]/60 dark:border-[#5C5854]/10 rounded-3xl opacity-50 relative overflow-hidden select-none">
                <div className="w-12 h-12 rounded-2xl bg-[#8C8780]/10 text-[#8C8780] flex items-center justify-center shrink-0">
                  <Cpu size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[15px] text-[#8C8780] dark:text-slate-400">
                      Download for Linux
                    </span>
                    <span className="px-2 py-0.5 bg-[#8C8780]/10 text-[#8C8780] text-[9px] font-bold rounded-md uppercase tracking-wide">
                      Soon
                    </span>
                  </div>
                  <p className="text-[12px] text-[#8C8780]/80 mt-0.5">
                    Debian / AppImage standard distribution
                  </p>
                </div>
                <div className="text-[11px] font-semibold text-[#8C8780] uppercase tracking-wider font-mono">
                  coming soon
                </div>
              </div>
            </div>

            {/* Footer trust badge */}
            <div className="mt-6 pt-5 border-t border-[#E8E4DF] dark:border-[#5C5854]/20 flex items-center justify-center gap-2 text-[11px] font-medium text-[#8C8780]">
              <ShieldCheck size={14} className="text-emerald-500" />
              <span>Signed & verified with SHA256 integrity check.</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
