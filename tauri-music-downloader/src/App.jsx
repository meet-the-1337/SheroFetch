import React, { useState, useEffect } from 'react'
import { invoke } from './apiBridge'
import { Music, Download, User, Play, Pause, X } from 'lucide-react'

// Desktop Audiophile Suite Components
import { DesktopSidebar } from './components/DesktopSidebar'
import { DesktopTopBar } from './components/DesktopTopBar'
import { DesktopLibraryView } from './components/DesktopLibraryView'
import { DesktopAcquireView } from './components/DesktopAcquireView'

// Modals
import { ProfileModal } from './components/ProfileModal'
import { SoulseekOnboardingModal } from './components/SoulseekOnboardingModal'

export default function App() {
  // Navigation & Search State
  const [activeTab, setActiveTab] = useState('library') // 'library' | 'acquire'
  const [searchQuery, setSearchQuery] = useState('')
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)
  const [soulseekProfile, setSoulseekProfile] = useState(null)

  // Library & Audio Player State
  const [library, setLibrary] = useState([])
  const [currentTrack, setCurrentTrack] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)

  // 1. Initial Library Load
  const loadLibrary = async () => {
    try {
      const list = await invoke('get_library')
      if (Array.isArray(list) && list.length > 0) {
        setLibrary(list)
      }
    } catch (e) {
      console.warn('[SheroFetch Desktop] Library load notice:', e)
    }
  }

  // 1b. Soulseek Profile Load
  const loadSoulseekProfile = async () => {
    try {
      const prof = await invoke('get_soulseek_profile')
      if (prof) {
        setSoulseekProfile(prof)
        if (!prof.logged_in || !prof.username) {
          setIsOnboardingOpen(true)
        }
      } else {
        setIsOnboardingOpen(true)
      }
    } catch (e) {
      console.warn('[SheroFetch Desktop] Profile load notice:', e)
      setIsOnboardingOpen(true)
    }
  }

  useEffect(() => {
    loadLibrary()
    loadSoulseekProfile()
  }, [])

  // 2. Play in Native High-End Player (Amberol / Mobile Audio Engine)
  const handlePlayInPlayer = async (track) => {
    if (!track) return
    const target = track.file_url || track.file_path || track.audio_stream_url
    if (!target) return
    try {
      await invoke('open_file', { filePath: target, file_path: target, track })
      if (currentTrack?.file_path === track.file_path || (currentTrack?.id && currentTrack?.id === track.id)) {
        setIsPlaying((prev) => !prev)
      } else {
        setCurrentTrack(track)
        setIsPlaying(true)
      }
    } catch (e) {
      console.warn('Error launching player:', e)
    }
  }

  // 3. Open System Vault in File Manager
  const handleOpenFolder = async (folderPath) => {
    try {
      let target = folderPath
      if (!target) {
        const cfg = await invoke('get_config')
        target = cfg?.install_dir || ''
      }
      await invoke('open_folder', { folder_path: target, folderPath: target })
    } catch (e) {
      console.warn('Open folder notice:', e)
    }
  }

  // 4. Callback when new track is acquired
  const handleTrackInstalled = (newTrack) => {
    setLibrary((prev) => {
      const exists = prev.some((t) => t.file_path === newTrack.file_path || (t.id && t.id === newTrack.id))
      if (exists) {
        return prev.map((t) => (t.file_path === newTrack.file_path ? newTrack : t))
      }
      return [newTrack, ...prev]
    })
  }

  return (
    <div className="w-screen h-screen flex bg-[#07080E] text-zinc-100 font-sans select-none overflow-hidden antialiased">
      {/* 1. Left Navigation Sidebar (Desktop only) */}
      <div className="hidden md:flex flex-shrink-0">
        <DesktopSidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          soulseekProfile={soulseekProfile}
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenOnboarding={() => setIsOnboardingOpen(true)}
          libraryCount={library.length}
          onOpenFolder={() => handleOpenFolder()}
        />
      </div>

      {/* 2. Main Content Stage */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-gradient-to-b from-[#090B14] to-[#07080E]">
        {/* Top Header Bar */}
        <DesktopTopBar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          soulseekProfile={soulseekProfile}
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenOnboarding={() => setIsOnboardingOpen(true)}
          onRescan={loadLibrary}
          onOpenFolder={() => handleOpenFolder()}
        />

        {/* Dynamic View Stage */}
        <main className="flex-1 overflow-hidden relative">
          {activeTab === 'library' && (
            <DesktopLibraryView
              library={library}
              onPlayInPlayer={handlePlayInPlayer}
              onOpenFolder={handleOpenFolder}
              onOpenAcquire={() => setActiveTab('acquire')}
              searchQuery={searchQuery}
            />
          )}

          {activeTab === 'acquire' && (
            <DesktopAcquireView
              onTrackInstalled={handleTrackInstalled}
              invokeFn={invoke}
              soulseekProfile={soulseekProfile}
              onOpenOnboarding={() => setIsOnboardingOpen(true)}
            />
          )}
        </main>

        {/* Mobile Mini Player Bar */}
        {currentTrack && (
          <div className="md:hidden h-14 bg-[#0A0D18]/95 backdrop-blur-2xl border-t border-cyan-500/20 px-3.5 flex items-center justify-between gap-3 z-30 flex-shrink-0 animate-slideUp">
            <div
              onClick={() => handlePlayInPlayer(currentTrack)}
              className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-white/10 overflow-hidden flex-shrink-0 shadow-md">
                {currentTrack.cover_path ? (
                  <img src={currentTrack.cover_path} alt="Art" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none' }} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[9px] font-mono text-cyan-400 font-bold">FLAC</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">{currentTrack.track || currentTrack.title || 'Unknown Track'}</p>
                <p className="text-[10px] text-zinc-400 truncate">{currentTrack.artist || 'Unknown Artist'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => handlePlayInPlayer(currentTrack)}
                className="w-8 h-8 rounded-full bg-cyan-500 active:bg-cyan-400 text-black flex items-center justify-center shadow-[0_0_10px_rgba(0,229,255,0.4)] transition active:scale-95"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5 fill-black" /> : <Play className="w-3.5 h-3.5 fill-black translate-x-0.5" />}
              </button>
              <button
                onClick={async () => {
                  await invoke('stop_playback')
                  setCurrentTrack(null)
                  setIsPlaying(false)
                }}
                className="p-1.5 text-zinc-400 hover:text-white"
                title="Dismiss player"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Mobile Bottom Navigation Bar (Phone only) */}
        <nav className="md:hidden h-16 bg-[#080A10]/95 backdrop-blur-2xl border-t border-white/10 flex items-center justify-around px-4 z-40 flex-shrink-0 select-none">
          <button
            onClick={() => setActiveTab('library')}
            className={`flex flex-col items-center gap-1 transition ${
              activeTab === 'library' ? 'text-cyan-400 font-bold scale-105' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Music className="w-5 h-5" />
            <span className="text-[11px] tracking-wide">Vault ({library.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('acquire')}
            className={`flex flex-col items-center gap-1 transition ${
              activeTab === 'acquire' ? 'text-cyan-400 font-bold scale-105' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Download className="w-5 h-5" />
            <span className="text-[11px] tracking-wide">Acquire</span>
          </button>

          <button
            onClick={() => setIsProfileOpen(true)}
            className="flex flex-col items-center gap-1 text-zinc-500 hover:text-zinc-300 transition"
          >
            <User className="w-5 h-5" />
            <span className="text-[11px] tracking-wide">Account</span>
          </button>
        </nav>
      </div>

      {/* Profile & Open-Source Ecosystem Modal */}
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        profile={soulseekProfile}
        onSignOut={() => {
          setSoulseekProfile({ username: '', logged_in: false, status: 'Guest Mode (Studio Engine)' })
          setIsProfileOpen(false)
        }}
        onOpenLogin={() => {
          setIsProfileOpen(false)
          setIsOnboardingOpen(true)
        }}
        invokeFn={invoke}
      />

      {/* Soulseek Connection Prompt Modal */}
      <SoulseekOnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onSuccess={(prof) => {
          setSoulseekProfile(prof)
          setIsOnboardingOpen(false)
        }}
        invokeFn={invoke}
      />
    </div>
  )
}
