import React from 'react'
import {
  Search,
  Plus,
  Folder,
  RefreshCw,
  User,
  ShieldCheck,
  Download,
  Sliders,
  Sparkles,
  Command
} from 'lucide-react'

export function DesktopTopBar({
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  soulseekProfile,
  onOpenProfile,
  onOpenOnboarding,
  onRescan,
  onOpenFolder
}) {
  const isSoulseekConnected = Boolean(soulseekProfile?.logged_in && soulseekProfile?.username)

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      const q = searchQuery.trim()
      // If it looks like a URL, auto-switch to Acquire tab
      if (q.startsWith('http://') || q.startsWith('https://')) {
        setActiveTab('acquire')
      }
    }
  }

  const getBreadcrumbTitle = () => {
    switch (activeTab) {
      case 'library':
        return 'Music Vault'
      case 'acquire':
        return 'Acquire & Download'
      default:
        return 'SheroFetch'
    }
  }

  return (
    <header className="h-14 md:h-16 px-3 md:px-6 border-b border-white/5 bg-[#080A10]/60 backdrop-blur-2xl flex items-center justify-between gap-2 md:gap-4 z-20 flex-shrink-0">
      {/* 1. Left Breadcrumb / Section Header */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#00e5ff] flex-shrink-0" />
        <h2 className="text-xs md:text-sm font-black tracking-wide text-white uppercase font-mono truncate">
          {getBreadcrumbTitle()}
        </h2>
      </div>

      {/* 2. Center Omnibox Search Bar (Desktop only, mobile uses Acquire view) */}
      <div className="hidden md:flex flex-1 max-w-xl">
        <div className="relative flex items-center group w-full">
          <Search className="absolute left-3.5 w-4 h-4 text-zinc-500 group-focus-within:text-cyan-400 transition-colors pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search tracks, artists, albums, or paste Spotify / YT URL..."
            className="w-full h-10 pl-10 pr-20 rounded-2xl bg-white/[0.04] focus:bg-black/80 border border-white/5 focus:border-cyan-500/50 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all shadow-inner font-medium"
          />
          <div className="absolute right-3 flex items-center gap-1 text-[10px] font-mono text-zinc-500 bg-white/[0.04] px-2 py-0.5 rounded-lg border border-white/5 pointer-events-none">
            <Command className="w-3 h-3" />
            <span>F</span>
          </div>
        </div>
      </div>

      {/* 3. Right Action Cluster */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Quick Acquire Button (Desktop) */}
        <button
          onClick={() => setActiveTab('acquire')}
          className={`hidden sm:flex h-9 px-3.5 rounded-xl text-xs font-bold transition-all items-center gap-1.5 shadow-sm ${
            activeTab === 'acquire'
              ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(0,229,255,0.4)]'
              : 'bg-white/[0.05] hover:bg-cyan-500/20 text-zinc-300 hover:text-cyan-300 border border-white/10 hover:border-cyan-500/30'
          }`}
          title="Acquire new songs from Soulseek P2P or Spotify/YT URLs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Music</span>
        </button>

        {/* Rescan Button */}
        <button
          onClick={onRescan}
          className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 text-zinc-400 hover:text-white transition"
          title="Rescan Local Library Vault"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        {/* Open Folder Button (Desktop only) */}
        <button
          onClick={onOpenFolder}
          className="hidden sm:flex p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 text-zinc-400 hover:text-white transition"
          title="Open Vault in System File Manager"
        >
          <Folder className="w-3.5 h-3.5" />
        </button>

        {/* Soulseek Profile Button */}
        <button
          onClick={() => {
            if (!isSoulseekConnected && onOpenOnboarding) {
              onOpenOnboarding()
            } else {
              onOpenProfile()
            }
          }}
          className="p-1.5 sm:p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-cyan-500/30 text-zinc-300 hover:text-white transition flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3"
          title="Soulseek P2P Profile & Credentials"
        >
          <User className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-bold max-w-[80px] truncate hidden md:inline">
            {soulseekProfile?.username ? `@${soulseekProfile.username}` : 'Profile'}
          </span>
          <span
            className={`w-2 h-2 rounded-full ${
              isSoulseekConnected
                ? 'bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse'
                : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
            }`}
          />
        </button>
      </div>
    </header>
  )
}
