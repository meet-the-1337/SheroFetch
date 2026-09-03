import React, { useState, useEffect, useRef, useMemo } from 'react'
import { invoke } from './apiBridge'
import { audioEngine } from './audioEngine'
import { PlayerStage } from './components/PlayerStage'
import { LibraryView } from './components/LibraryView'
import { EqualizerView } from './components/EqualizerView'
import { AcquireModal } from './components/AcquireModal'
import { PowerampDock } from './components/PowerampDock'
import { SoulseekOnboardingModal } from './components/SoulseekOnboardingModal'
import { ProfileModal } from './components/ProfileModal'

export default function App() {
  // Navigation & Modal State
  const [activeTab, setActiveTab] = useState('player') // 'player' | 'library' | 'equalizer'
  const [isAcquireOpen, setIsAcquireOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)
  const [soulseekProfile, setSoulseekProfile] = useState(null)

  // Library & Playback State
  const [library, setLibrary] = useState([])
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [lrcText, setLrcText] = useState('')
  const [repeatMode, setRepeatMode] = useState('all') // 'off' | 'all' | 'one'
  const [shuffleMode, setShuffleMode] = useState(false)

  const audioRef = useRef(null)

  // Current track object
  const currentTrack = useMemo(() => {
    if (library.length === 0) return null
    return library[currentTrackIndex] || library[0]
  }, [library, currentTrackIndex])

  // 1. Initial Library Load
  const loadLibrary = async () => {
    try {
      const list = await invoke('get_library')
      if (Array.isArray(list) && list.length > 0) {
        setLibrary(list)

        // Asynchronously resolve missing or local artwork for all tracks
        let dirty = false
        const updated = await Promise.all(list.map(async (t) => {
          if (!t.cover_path || t.cover_path.startsWith('http://127.0.0.1') || t.cover_path.startsWith('http://localhost') || t.cover_path.endsWith('/cover.jpg')) {
            try {
              const q = encodeURIComponent(`${t.artist} ${t.track}`)
              const r = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=1`)
              const d = await r.json()
              if (d?.results?.[0]?.artworkUrl100) {
                const hiRes = d.results[0].artworkUrl100.replace('100x100bb.jpg', '1000x1000bb.jpg')
                dirty = true
                return { ...t, cover_path: hiRes, has_cover: true }
              }
            } catch {}
          }
          return t
        }))
        if (dirty) {
          setLibrary(updated)
          try {
            localStorage.setItem('sherofetch_library', JSON.stringify(updated))
          } catch {}
        }
      }
    } catch (e) {
      console.warn('[Poweramp App] Library load notice:', e)
    }
  }

  // 1b. Soulseek Profile & Onboarding Prompt
  const loadSoulseekProfile = async () => {
    try {
      const prof = await invoke('get_soulseek_profile')
      if (prof) {
        setSoulseekProfile(prof)
        const done = localStorage.getItem('sherofetch_onboarding_done')
        if (!prof.logged_in && !done) {
          setIsOnboardingOpen(true)
        }
      }
    } catch (e) {
      console.warn('[Poweramp App] Profile load notice:', e)
    }
  }

  useEffect(() => {
    loadLibrary()
    loadSoulseekProfile()
  }, [])

  // 2. Fetch Lyrics (.lrc) when Current Track Changes
  // 2. Fetch Lyrics (.lrc) when Current Track Changes
  useEffect(() => {
    if (!currentTrack) {
      setLrcText('')
      return
    }

    const fetchLrc = async () => {
      try {
        // A: Check if track object already carries lrc_content
        if (currentTrack.lrc_content && currentTrack.lrc_content.trim()) {
          setLrcText(currentTrack.lrc_content)
          return
        }

        // B: Check local storage cache
        const key = `sherofetch_lrc_${currentTrack.lrc_path}`
        const cached = localStorage.getItem(key)
        if (cached && cached.trim()) {
          setLrcText(cached)
          return
        }

        // C: Read from filesystem via backend
        if (currentTrack.lrc_path) {
          const lrc = await invoke('read_lrc_content', { path: currentTrack.lrc_path })
          if (lrc && lrc.trim()) {
            setLrcText(lrc)
            return
          }
        }

        // D: Real-time fallback fetch from LRCLIB
        const artist = currentTrack.artist || ''
        const title = currentTrack.track || currentTrack.title || ''
        if (artist && title) {
          const fresh = await invoke('fetch_synced_lyrics', { artist, title })
          if (fresh && fresh.trim()) {
            setLrcText(fresh)
            return
          }
        }
      } catch (e) {
        console.warn('Lyrics fetch notice:', e)
      }
      setLrcText('')
    }

    fetchLrc()
  }, [currentTrack?.id, currentTrack?.file_path, currentTrackIndex])

  // 3. Audio Element Event Handlers
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const dur = audioRef.current.duration
      if (dur && !isNaN(dur) && dur > 0) {
        setDuration(dur)
      } else if (currentTrack?.duration) {
        setDuration(currentTrack.duration)
      }
    }
  }

  const handleTrackEnded = () => {
    if (repeatMode === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0
        audioRef.current.play().catch(() => {})
      }
    } else if (repeatMode === 'all') {
      handleNext()
    } else {
      if (currentTrackIndex < library.length - 1) {
        handleNext()
      } else {
        setIsPlaying(false)
      }
    }
  }

  // 4. Playback Controls
  const togglePlay = () => {
    if (!audioRef.current || !currentTrack) return

    // Ensure audio src is loaded
    const sourceUrl = currentTrack.file_url || currentTrack.audio_stream_url || ''
    if (!audioRef.current.src || audioRef.current.src === window.location.href) {
      audioRef.current.src = sourceUrl
      audioRef.current.load()
    }

    // Initialize WebAudio DSP gracefully without blocking playback
    try {
      audioEngine.init(audioRef.current)
    } catch (dspErr) {
      console.warn('[AudioEngine] DSP initialization notice:', dspErr)
    }

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch((e) => {
          console.warn('[AudioEngine] Play warning, attempting audio_stream_url:', e)
          if (currentTrack.audio_stream_url && audioRef.current.src !== currentTrack.audio_stream_url) {
            audioRef.current.src = currentTrack.audio_stream_url
            audioRef.current.load()
            audioRef.current.play()
              .then(() => setIsPlaying(true))
              .catch((err2) => console.error('[AudioEngine] Stream fallback failed:', err2))
          }
        })
    }
  }

  const handleSeek = (newSecs) => {
    if (audioRef.current) {
      audioRef.current.currentTime = newSecs
      setCurrentTime(newSecs)
    }
  }

  const handlePrev = () => {
    if (library.length === 0) return
    let nextIdx
    if (shuffleMode) {
      nextIdx = Math.floor(Math.random() * library.length)
    } else {
      nextIdx = (currentTrackIndex - 1 + library.length) % library.length
    }
    setCurrentTrackIndex(nextIdx)
    setIsPlaying(true)
  }

  const handleNext = () => {
    if (library.length === 0) return
    let nextIdx
    if (shuffleMode) {
      nextIdx = Math.floor(Math.random() * library.length)
    } else {
      nextIdx = (currentTrackIndex + 1) % library.length
    }
    setCurrentTrackIndex(nextIdx)
    setIsPlaying(true)
  }

  const handleSelectTrack = (track) => {
    const idx = library.findIndex((t) => t.id === track.id || t.file_path === track.file_path)
    if (idx !== -1) {
      setCurrentTrackIndex(idx)
      setIsPlaying(true)
      setActiveTab('player')
    }
  }

  const toggleRepeat = () => {
    if (repeatMode === 'off') setRepeatMode('all')
    else if (repeatMode === 'all') setRepeatMode('one')
    else setRepeatMode('off')
  }

  const toggleShuffle = () => {
    setShuffleMode(!shuffleMode)
  }

  // 5. Autoplay on track index/object change if active
  useEffect(() => {
    if (!audioRef.current || !currentTrack) return

    const sourceUrl = currentTrack.file_url || currentTrack.audio_stream_url || ''
    console.log(`[AudioEngine] Setting active track: "${currentTrack.track}" -> ${sourceUrl}`)

    if (audioRef.current.src !== sourceUrl) {
      audioRef.current.src = sourceUrl
      audioRef.current.load()
    }

    if (isPlaying) {
      const p = audioRef.current.play()
      if (p !== undefined) {
        p.catch((e) => {
          console.warn('[AudioEngine] Play warning on local file, falling back to stream:', e)
          if (currentTrack.audio_stream_url && audioRef.current.src !== currentTrack.audio_stream_url) {
            audioRef.current.src = currentTrack.audio_stream_url
            audioRef.current.load()
            audioRef.current.play().catch((err2) => console.error('[AudioEngine] Stream play failed:', err2))
          }
        })
      }
    }
  }, [currentTrack?.id, currentTrack?.file_path, currentTrackIndex])

  // 6. Callback when new track is acquired from the Extra Feature Window
  const handleTrackInstalled = (newTrack) => {
    setLibrary((prev) => {
      const exists = prev.some((t) => t.file_path === newTrack.file_path)
      if (exists) return prev
      return [newTrack, ...prev]
    })
    // Auto-select newly acquired song and switch to player
    setCurrentTrackIndex(0)
    setIsPlaying(true)
    setActiveTab('player')

    // Force audio element to load the new track immediately
    if (audioRef.current) {
      const src = newTrack.file_url || newTrack.audio_stream_url || ''
      audioRef.current.src = src
      audioRef.current.load()
      audioRef.current.play().catch(() => {})
    }
  }

  return (
    <div className="w-screen h-screen flex flex-col bg-[#07080B] text-zinc-100 font-sans overflow-hidden select-none">
      {/* Native HTML5 Audio Engine (No crossOrigin block on local _capacitor_file_ audio) */}
      <audio
        ref={audioRef}
        onError={(e) => {
          const err = audioRef.current?.error
          console.error('[AudioEngine Tag Error] code:', err?.code, 'message:', err?.message, 'src:', audioRef.current?.src)
          if (currentTrack?.audio_stream_url && audioRef.current?.src !== currentTrack.audio_stream_url) {
            console.log('[AudioEngine] Attempting audio_stream_url fallback:', currentTrack.audio_stream_url)
            audioRef.current.src = currentTrack.audio_stream_url
            audioRef.current.load()
            audioRef.current.play().catch((playErr) => {
              console.error('[AudioEngine] Fallback play error:', playErr)
            })
          }
        }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleTrackEnded}
      />

      {/* Main Viewport */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'player' && (
          <PlayerStage
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            lrcText={lrcText}
            repeatMode={repeatMode}
            shuffleMode={shuffleMode}
            onTogglePlay={togglePlay}
            onPrev={handlePrev}
            onNext={handleNext}
            onSeek={handleSeek}
            onToggleRepeat={toggleRepeat}
            onToggleShuffle={toggleShuffle}
            onOpenEqualizer={() => setActiveTab('equalizer')}
            onOpenAcquire={() => setIsAcquireOpen(true)}
            onBackToLibrary={() => setActiveTab('library')}
            onOpenProfile={() => setIsProfileOpen(true)}
            soulseekProfile={soulseekProfile}
            trackIndex={currentTrackIndex}
            totalTracks={library.length}
          />
        )}

        {activeTab === 'library' && (
          <LibraryView
            library={library}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onSelectTrack={handleSelectTrack}
            onOpenAcquire={() => setIsAcquireOpen(true)}
            onOpenProfile={() => setIsProfileOpen(true)}
            soulseekProfile={soulseekProfile}
          />
        )}

        {activeTab === 'search' && (
          <LibraryView
            library={library}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onSelectTrack={handleSelectTrack}
            onOpenAcquire={() => setIsAcquireOpen(true)}
            onOpenProfile={() => setIsProfileOpen(true)}
            soulseekProfile={soulseekProfile}
            initialCategory="all"
          />
        )}

        {activeTab === 'equalizer' && (
          <EqualizerView onClose={() => setActiveTab('player')} />
        )}
      </div>

      {/* Floating Poweramp Dock (Screenshot 1, 2, 3, 4, 5) */}
      {activeTab !== 'player' && (
        <PowerampDock
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onTogglePlay={togglePlay}
          onOpenPlayer={() => setActiveTab('player')}
          onOpenAcquire={() => setIsAcquireOpen(true)}
        />
      )}

      {/* Extra Feature Window: SheroFetch Acquisition Engine Modal */}
      <AcquireModal
        isOpen={isAcquireOpen}
        onClose={() => setIsAcquireOpen(false)}
        onTrackInstalled={handleTrackInstalled}
        invokeFn={invoke}
      />

      {/* Profile & Open-Source Hub Modal */}
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

      {/* Soulseek P2P Onboarding Prompt Modal */}
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
