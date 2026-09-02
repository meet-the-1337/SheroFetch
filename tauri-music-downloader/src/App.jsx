import React, { useState, useEffect, useRef, useMemo } from 'react'
import { invoke } from './apiBridge'
import { audioEngine } from './audioEngine'
import { PlayerStage } from './components/PlayerStage'
import { LibraryView } from './components/LibraryView'
import { EqualizerView } from './components/EqualizerView'
import { AcquireModal } from './components/AcquireModal'
import { PowerampDock } from './components/PowerampDock'

export default function App() {
  // Navigation & Modal State
  const [activeTab, setActiveTab] = useState('player') // 'player' | 'library' | 'equalizer'
  const [isAcquireOpen, setIsAcquireOpen] = useState(false)

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
      }
    } catch (e) {
      console.warn('[Poweramp App] Library load notice:', e)
    }
  }

  useEffect(() => {
    loadLibrary()
  }, [])

  // 2. Fetch Lyrics (.lrc) when Current Track Changes
  useEffect(() => {
    if (!currentTrack) {
      setLrcText('')
      return
    }

    const fetchLrc = async () => {
      try {
        if (currentTrack.lrc_path) {
          const lrc = await invoke('read_lrc_content', { path: currentTrack.lrc_path })
          if (lrc) {
            setLrcText(lrc)
            return
          }
        }
        // Check local storage cache
        const key = `sherofetch_lrc_${currentTrack.lrc_path}`
        const cached = localStorage.getItem(key)
        if (cached) {
          setLrcText(cached)
          return
        }
        setLrcText('')
      } catch (e) {
        setLrcText('')
      }
    }

    fetchLrc()
  }, [currentTrack])

  // 3. Audio Element Event Handlers
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || currentTrack?.duration || 0)
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

    // Initialize WebAudio DSP on first user gesture
    audioEngine.init(audioRef.current)

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch((e) => console.warn('Play interrupted:', e))
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

  // 5. Autoplay on track index change if active
  useEffect(() => {
    if (audioRef.current && currentTrack) {
      audioRef.current.src = currentTrack.file_url || currentTrack.audio_stream_url || ''
      if (isPlaying) {
        audioRef.current.play().catch(() => {})
      }
    }
  }, [currentTrackIndex])

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
  }

  return (
    <div className="w-screen h-screen flex flex-col bg-[#07080B] text-zinc-100 font-sans overflow-hidden select-none">
      {/* Hidden Native Audio Element */}
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
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
          />
        )}

        {activeTab === 'search' && (
          <LibraryView
            library={library}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onSelectTrack={handleSelectTrack}
            onOpenAcquire={() => setIsAcquireOpen(true)}
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
    </div>
  )
}
