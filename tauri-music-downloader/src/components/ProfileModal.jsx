import React, { useState } from 'react'
import {
  X,
  User,
  Disc,
  Radio,
  LogOut,
  LogIn,
  Layers,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Folder,
  Globe,
  Database,
  FileText,
  Cpu,
  RefreshCw
} from 'lucide-react'

export function ProfileModal({
  isOpen,
  onClose,
  profile,
  onSignOut,
  onOpenLogin,
  invokeFn
}) {
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  if (!isOpen) return null

  const isLoggedIn = Boolean(profile?.logged_in && profile?.username)
  const username = profile?.username || 'Guest Audiophile'
  const initial = username.charAt(0).toUpperCase() || 'G'

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      if (invokeFn) {
        await invokeFn('logout_soulseek_profile')
      }
      if (onSignOut) onSignOut()
    } catch (e) {
      console.error('Logout error:', e)
    } finally {
      setIsLoggingOut(false)
    }
  }

  const openSourceModules = [
    {
      title: 'Soulseek P2P Mesh',
      category: 'Decentralized Audio Network',
      icon: Disc,
      color: 'text-cyan-400',
      border: 'border-cyan-500/20',
      bg: 'bg-cyan-500/5',
      desc: 'Connects directly to server.slsknet.org:2242 over direct TCP peer sockets, acquiring genuine uncompressed 16-bit / 24-bit studio CD and vinyl FLAC rips directly from audiophile collectors worldwide.'
    },
    {
      title: 'MusicBrainz Ontology',
      category: 'Canonical Music Database',
      icon: Database,
      color: 'text-purple-400',
      border: 'border-purple-500/20',
      bg: 'bg-purple-500/5',
      desc: 'The open-source community music encyclopedia. Powers acoustic fuzzy matching, official Release Group resolution, canonical MBIDs, and year verification.'
    },
    {
      title: 'LRCLIB Synced Lyrics',
      category: 'Crowdsourced Timecoded Lyrics',
      icon: FileText,
      color: 'text-amber-400',
      border: 'border-amber-500/20',
      bg: 'bg-amber-500/5',
      desc: 'Free, community-driven synchronized lyrics engine. Delivers line-by-line millisecond-precision .lrc files rendered in the real-time HUD.'
    },
    {
      title: 'yt-dlp Stream Engine',
      category: 'Studio Master Failover',
      icon: Radio,
      color: 'text-emerald-400',
      border: 'border-emerald-500/20',
      bg: 'bg-emerald-500/5',
      desc: 'Open-source audio extraction pipeline. Serves as instant 320kbps failover when a rare peer is unavailable so searches never fail.'
    },
    {
      title: 'Capacitor Native Runtime',
      category: 'Low-Latency Mobile Architecture',
      icon: Cpu,
      color: 'text-blue-400',
      border: 'border-blue-500/20',
      bg: 'bg-blue-500/5',
      desc: 'Cross-platform native bridge interfacing Android MediaCodec, AudioTrack hardware buffers, and scoped internal/Documents storage.'
    }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-md max-h-[92vh] bg-zinc-950 border border-white/10 rounded-3xl p-5 shadow-2xl flex flex-col gap-4 overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white">Audiophile Profile & Network</h2>
              <p className="text-[11px] text-zinc-400">Decentralized P2P & Open-Source Stack</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-zinc-900 text-zinc-400 hover:text-white border border-white/5 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4 custom-scrollbar">

          {/* 1. Account HUD */}
          <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/10 flex flex-col gap-3.5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-teal-400 flex items-center justify-center text-black font-black text-xl shadow-[0_0_15px_rgba(0,229,255,0.25)] flex-shrink-0">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-extrabold text-white truncate">
                    {isLoggedIn ? `@${username}` : 'Guest User'}
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      isLoggedIn
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-zinc-700/50 text-zinc-400 border border-white/10'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isLoggedIn ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                    {isLoggedIn ? 'P2P Mesh Active' : 'Studio Engine Only'}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 font-mono mt-0.5 truncate">
                  {profile?.server || 'server.slsknet.org:2242'}
                </p>
              </div>
            </div>

            {/* Storage Path Info */}
            <div className="pt-2.5 border-t border-white/5 flex items-center gap-2 text-[11px] text-zinc-400">
              <Folder className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
              <span className="truncate">Vault: Documents/SheroFetch/Music/</span>
            </div>

            {/* Action Row: Sign Out or Sign In */}
            <div className="pt-2 border-t border-white/5 flex items-center gap-2">
              {isLoggedIn ? (
                <>
                  <button
                    onClick={() => {
                      onClose()
                      if (onOpenLogin) onOpenLogin()
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 text-xs font-bold flex items-center justify-center gap-1.5 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Switch Account</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="flex-1 py-2 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{isLoggingOut ? 'Signing out...' : 'Sign Out'}</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    onClose()
                    if (onOpenLogin) onOpenLogin()
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(0,229,255,0.3)] transition"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Connect Soulseek P2P Account</span>
                </button>
              )}
            </div>
          </div>

          {/* 2. Open Source Ecosystem Showcase */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>Open-Source Stack & Technologies</span>
              </h4>
              <span className="text-[10px] text-zinc-500 font-mono">100% Free & Open</span>
            </div>

            <div className="flex flex-col gap-2">
              {openSourceModules.map((mod) => {
                const Icon = mod.icon
                return (
                  <div
                    key={mod.title}
                    className={`p-3 rounded-2xl ${mod.bg} border ${mod.border} flex flex-col gap-1 transition`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${mod.color}`} />
                        <span className="text-xs font-bold text-white">{mod.title}</span>
                      </div>
                      <span className="text-[10px] font-mono font-medium text-zinc-400">
                        {mod.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed pl-6">
                      {mod.desc}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs text-zinc-500">
          <div className="flex items-center gap-1.5 text-zinc-400">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>SheroFetch Audiophile Suite v2.0</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold transition"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  )
}
