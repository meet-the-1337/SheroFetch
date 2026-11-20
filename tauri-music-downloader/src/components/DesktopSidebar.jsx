import React from 'react'
import {
  Disc,
  Music,
  Download,
  Sliders,
  Folder,
  Radio,
  User,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
  Sparkles,
  Layers,
  Database
} from 'lucide-react'

export function DesktopSidebar({
  activeTab,
  setActiveTab,
  soulseekProfile,
  onOpenProfile,
  onOpenOnboarding,
  libraryCount = 0,
  onOpenFolder
}) {
  const isSoulseekConnected = Boolean(soulseekProfile?.logged_in && soulseekProfile?.username)

  const navItems = [
    {
      id: 'library',
      label: 'Music Vault',
      sublabel: 'Lossless Library',
      icon: Music,
      badge: libraryCount > 0 ? libraryCount : null
    },
    {
      id: 'acquire',
      label: 'Acquire & Download',
      sublabel: 'P2P Mesh & Streams',
      icon: Download,
      badge: 'P2P'
    }
  ]

  return (
    <aside className="w-64 h-full bg-[#080A10]/95 backdrop-blur-3xl border-r border-white/5 flex flex-col justify-between select-none z-30 flex-shrink-0">
      {/* 1. Header / Branding */}
      <div className="p-5 pb-3">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-indigo-600 shadow-[0_0_20px_rgba(0,229,255,0.4)]">
            <Disc className="w-5 h-5 text-black animate-spin-slow" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#080A10] shadow-[0_0_8px_#34d399]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-base font-black tracking-wider text-white font-mono">SHEROFETCH</span>
            </div>
            <p className="text-[10px] font-mono tracking-widest text-cyan-400/90 uppercase font-bold">
              AUDIOPHILE SUITE
            </p>
          </div>
        </div>

        {/* Soulseek P2P Status Chip (Explicit Green = Real Connected, Red = Failed/Disconnected) */}
        <div
          onClick={() => {
            if (!isSoulseekConnected && onOpenOnboarding) {
              onOpenOnboarding()
            } else {
              onOpenProfile()
            }
          }}
          className={`mt-4 p-3 rounded-2xl border transition-all cursor-pointer group shadow-sm ${
            isSoulseekConnected
              ? 'bg-emerald-500/[0.06] hover:bg-emerald-500/[0.12] border-emerald-500/30 hover:border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
              : 'bg-rose-500/[0.06] hover:bg-rose-500/[0.12] border-rose-500/30 hover:border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
          }`}
          title={isSoulseekConnected ? 'Real Soulseek P2P Mesh Connected & Verified' : 'P2P Offline - Click to Enter Credentials & Verify'}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  isSoulseekConnected
                    ? 'bg-emerald-400 shadow-[0_0_10px_#34d399] animate-pulse'
                    : 'bg-rose-500 shadow-[0_0_10px_#f43f5e]'
                }`}
              />
              <span className={`text-xs font-bold truncate ${isSoulseekConnected ? 'text-emerald-300 group-hover:text-white' : 'text-rose-300 group-hover:text-white'}`}>
                {isSoulseekConnected
                  ? `@${soulseekProfile.username}`
                  : 'P2P Mesh Offline'}
              </span>
            </div>
            <span
              className={`text-[9px] font-mono font-black px-2 py-0.5 rounded-md flex-shrink-0 border uppercase tracking-wider ${
                isSoulseekConnected
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              }`}
            >
              {isSoulseekConnected ? 'VERIFIED' : 'NOT CONNECTED'}
            </span>
          </div>
          <p className="text-[10px] text-zinc-400 mt-1 truncate font-mono">
            {isSoulseekConnected ? 'Authentic 1411k+ P2P Active' : 'Click to Authenticate P2P'}
          </p>
        </div>
      </div>

      {/* 2. Navigation Menu */}
      <nav className="flex-1 px-3 py-2 space-y-1.5 overflow-y-auto">
        <p className="px-3 text-[10px] font-mono font-bold tracking-widest text-zinc-500 uppercase mb-2">
          NAVIGATION
        </p>

        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl transition-all duration-200 group relative ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-500/15 via-cyan-500/5 to-transparent text-white border border-cyan-500/30 shadow-[0_0_15px_rgba(0,229,255,0.1)]'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.03] border border-transparent'
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-cyan-400 rounded-r-full shadow-[0_0_10px_#00e5ff]" />
              )}
              <div className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`w-4 h-4 flex-shrink-0 transition-colors ${
                    isActive ? 'text-cyan-400' : 'text-zinc-500 group-hover:text-zinc-300'
                  }`}
                />
                <div className="text-left min-w-0">
                  <div className={`text-xs font-bold truncate ${isActive ? 'text-white' : 'text-zinc-300'}`}>
                    {item.label}
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate font-medium">
                    {item.sublabel}
                  </div>
                </div>
              </div>

              {item.badge && (
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full flex-shrink-0 border ${
                    isActive
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                      : 'bg-zinc-800 text-zinc-400 border-white/5'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* 3. Storage Vault & System Card */}
      <div className="p-4 border-t border-white/5 space-y-2">
        <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-zinc-300 flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-cyan-400" />
              <span>Storage Vault</span>
            </span>
            <span className="text-[10px] font-mono text-zinc-500">Auto-Tagged</span>
          </div>

          <p className="text-[10px] text-zinc-500 font-mono truncate">
            ~/Music/MusicDownloader
          </p>

          <button
            onClick={onOpenFolder}
            className="w-full py-1.5 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-bold text-zinc-300 hover:text-white transition flex items-center justify-center gap-1.5"
            title="Open music folder in system file manager"
          >
            <Folder className="w-3.5 h-3.5 text-cyan-400" />
            <span>Open in Files</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
