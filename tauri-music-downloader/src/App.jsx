import React, { useState, useEffect, useRef, useMemo } from 'react'
import { invoke } from './apiBridge'
import { audioEngine } from './audioEngine'
import { PlayerStage } from './components/PlayerStage'
import { LibraryView } from './components/LibraryView'
import { EqualizerView } from './components/EqualizerView'
import { AcquireModal } from './components/AcquireModal'
import {
  Disc,
  ListMusic,
  Sliders,
  Sparkles,
  Play,
  Pause,
  SkipForward
} from 'lucide-react'

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

        {activeTab === 'equalizer' && (
          <EqualizerView onClose={() => setActiveTab('player')} />
        )}
      </div>

      {/* Floating Mini-Player Bar (Visible when browsing Library or Equalizer while song is selected) */}
      {activeTab !== 'player' && currentTrack && (
        <div
          onClick={() => setActiveTab('player')}
          className="mx-3 mb-2 px-3 py-2 rounded-2xl bg-zinc-900/90 border border-white/10 backdrop-blur-xl flex items-center justify-between cursor-pointer shadow-2xl transition active:scale-[0.99]"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <img
              src={currentTrack.cover_path || ''}
              alt="Mini Cover"
              className="w-10 h-10 rounded-xl object-cover border border-white/10 bg-zinc-800"
              onError={(e) => { e.target.style.display = 'none' }}
            />
            <div className="min-w-0 flex-1">
              <h5 className="text-xs font-bold text-white truncate">{currentTrack.track}</h5>
              <p className="text-[10px] text-cyan-400 truncate">{currentTrack.artist}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                togglePlay()
              }}
              className="p-2 rounded-full text-white hover:text-cyan-400 transition"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleNext()
              }}
              className="p-2 rounded-full text-zinc-400 hover:text-white transition"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Poweramp Signature Bottom Navigation Bar */}
      <div className="h-16 px-4 flex items-center justify-around bg-[#090C12] border-t border-white/10 select-none z-30">
        <button
          onClick={() => setActiveTab('player')}
          className={`flex flex-col items-center gap-1 transition ${
            activeTab === 'player' ? 'text-cyan-400' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Disc className={`w-5 h-5 ${activeTab === 'player' ? 'drop-shadow-[0_0_8px_#00E5FF]' : ''}`} />
          <span className="text-[10px] font-bold tracking-wider uppercase">Player</span>
        </button>

        <button
          onClick={() => setActiveTab('library')}
          className={`flex flex-col items-center gap-1 transition ${
            activeTab === 'library' ? 'text-cyan-400' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <ListMusic className={`w-5 h-5 ${activeTab === 'library' ? 'drop-shadow-[0_0_8px_#00E5FF]' : ''}`} />
          <span className="text-[10px] font-bold tracking-wider uppercase">Library</span>
        </button>

        <button
          onClick={() => setActiveTab('equalizer')}
          className={`flex flex-col items-center gap-1 transition ${
            activeTab === 'equalizer' ? 'text-cyan-400' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Sliders className={`w-5 h-5 ${activeTab === 'equalizer' ? 'drop-shadow-[0_0_8px_#00E5FF]' : ''}`} />
          <span className="text-[10px] font-bold tracking-wider uppercase">Equalizer</span>
        </button>

        {/* The Special Feature Window: Acquire / Install Songs */}
        <button
          onClick={() => setIsAcquireOpen(true)}
          className="flex flex-col items-center gap-1 text-cyan-400 group transition active:scale-95"
        >
          <div className="p-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 group-hover:bg-cyan-500 group-hover:text-black transition shadow-[0_0_12px_rgba(0,229,255,0.3)]">
            <Sparkles className="w-4 h-4" />
          </div>
          <span className="text-[10px] font-bold tracking-wider uppercase text-cyan-400">Acquire</span>
        </button>
      </div>

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
