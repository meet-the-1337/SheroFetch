import React, { useState } from 'react'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Mic2,
  Sliders,
  Maximize2,
  Heart,
  Disc
} from 'lucide-react'

export function DesktopPlayerDeck({
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
  repeatMode = 'all', // 'off' | 'all' | 'one'
  shuffleMode = false,
  onToggleRepeat,
  onToggleShuffle,
  onOpenNowPlaying,
  onOpenEqualizer,
  onOpenLyrics,
  audioEngine
}) {
  const [volume, setVolume] = useState(1.0)
  const [isMuted, setIsMuted] = useState(false)
  const [isLiked, setIsLiked] = useState(false)

  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0

  const handleSeekChange = (e) => {
    const newProgress = parseFloat(e.target.value)
    if (duration > 0) {
      onSeek(newProgress * duration)
    }
  }

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value)
    setVolume(val)
    if (isMuted && val > 0) setIsMuted(false)
    if (audioEngine?.gainNode) {
      audioEngine.gainNode.gain.value = val
    }
  }

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false)
      if (audioEngine?.gainNode) audioEngine.gainNode.gain.value = volume
    } else {
      setIsMuted(true)
      if (audioEngine?.gainNode) audioEngine.gainNode.gain.value = 0
    }
  }

  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return '0:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  const isFlac = (currentTrack?.file_path || '').toLowerCase().endsWith('.flac') || currentTrack?.source_used?.includes('FLAC')

  return (
    <footer className="h-22 bg-[#080A10]/95 backdrop-blur-3xl border-t border-white/5 px-6 flex items-center justify-between gap-6 z-40 select-none flex-shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
      {/* 1. Left: Track Info & Thumbnail */}
      <div className="w-72 flex items-center gap-3.5 min-w-0">
        <div
          onClick={onOpenNowPlaying}
          className="relative w-14 h-14 rounded-2xl overflow-hidden bg-zinc-900 border border-white/10 flex-shrink-0 shadow-md cursor-pointer group"
        >
          {currentTrack?.cover_path ? (
            <img
              src={currentTrack.cover_path}
              alt="Deck Cover"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              onError={(e) => { e.target.style.display = 'none' }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600">
              <Disc className={`w-7 h-7 ${isPlaying ? 'animate-spin-slow' : ''}`} />
            </div>
          )}
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Maximize2 className="w-4 h-4 text-white" />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <h4
            onClick={onOpenNowPlaying}
            className="text-xs font-bold text-white truncate hover:text-cyan-400 transition-colors cursor-pointer"
          >
            {currentTrack?.track || currentTrack?.title || 'No Track Playing'}
          </h4>
          <p className="text-[11px] text-zinc-400 truncate mt-0.5 font-medium">
            {currentTrack?.artist || 'SheroFetch Vault'}
          </p>

          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              {isFlac ? 'FLAC' : '320K'}
            </span>
            {currentTrack?.tier === 'green' && (
              <span className="text-[9px] font-mono font-bold text-emerald-400">
                P2P
              </span>
            )}
          </div>
        </div>

        <button
          onClick={() => setIsLiked(!isLiked)}
          className={`p-2 rounded-xl transition ${
            isLiked ? 'text-rose-400' : 'text-zinc-500 hover:text-zinc-300'
          }`}
          title="Favorite"
        >
          <Heart className={`w-4 h-4 ${isLiked ? 'fill-rose-400' : ''}`} />
        </button>
      </div>

      {/* 2. Center: Controls & Waveform Seekbar */}
      <div className="flex-1 max-w-2xl flex flex-col items-center gap-1.5">
        {/* Buttons Row */}
        <div className="flex items-center gap-5">
          {/* Shuffle */}
          <button
            onClick={onToggleShuffle}
            className={`p-1.5 rounded-lg transition ${
              shuffleMode ? 'text-cyan-400' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title={shuffleMode ? 'Shuffle On' : 'Shuffle Off'}
          >
            <Shuffle className="w-4 h-4" />
          </button>

          {/* Prev */}
          <button
            onClick={onPrev}
            className="p-1.5 text-zinc-300 hover:text-white transition active:scale-90"
            title="Previous Track"
          >
            <SkipBack className="w-5 h-5 fill-current" />
          </button>

          {/* Tactile Play/Pause Dome */}
          <button
            onClick={onTogglePlay}
            className="w-11 h-11 rounded-full bg-gradient-to-tr from-cyan-500 to-cyan-400 text-black flex items-center justify-center shadow-[0_0_20px_rgba(0,229,255,0.5)] hover:shadow-[0_0_28px_rgba(0,229,255,0.7)] transition-all active:scale-95"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-black" />
            ) : (
              <Play className="w-5 h-5 fill-black translate-x-0.5" />
            )}
          </button>

          {/* Next */}
          <button
            onClick={onNext}
            className="p-1.5 text-zinc-300 hover:text-white transition active:scale-90"
            title="Next Track"
          >
            <SkipForward className="w-5 h-5 fill-current" />
          </button>

          {/* Repeat */}
          <button
            onClick={onToggleRepeat}
            className={`p-1.5 rounded-lg transition ${
              repeatMode !== 'off' ? 'text-cyan-400' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title={`Repeat: ${repeatMode.toUpperCase()}`}
          >
            {repeatMode === 'one' ? (
              <Repeat1 className="w-4 h-4" />
            ) : (
              <Repeat className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* High-Precision Seekbar */}
        <div className="w-full flex items-center gap-3">
          <span className="text-[10px] font-mono text-zinc-400 w-10 text-right">
            {formatTime(currentTime)}
          </span>

          <div className="relative flex-1 flex items-center group py-1">
            <input
              type="range"
              min="0"
              max="1"
              step="0.001"
              value={progress}
              onChange={handleSeekChange}
              className="w-full h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-cyan-400 focus:outline-none"
            />
          </div>

          <span className="text-[10px] font-mono text-zinc-400 w-10">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* 3. Right: Volume & Shortcuts */}
      <div className="w-72 flex items-center justify-end gap-4">
        {/* Synced Lyrics Shortcut */}
        <button
          onClick={onOpenLyrics}
          className="p-2 text-zinc-400 hover:text-cyan-400 transition"
          title="Lyrics HUD"
        >
          <Mic2 className="w-4 h-4" />
        </button>

        {/* Studio EQ Shortcut */}
        <button
          onClick={onOpenEqualizer}
          className="p-2 text-zinc-400 hover:text-cyan-400 transition"
          title="10-Band Studio DSP"
        >
          <Sliders className="w-4 h-4" />
        </button>

        {/* Volume Slider */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMute}
            className="text-zinc-400 hover:text-white transition"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-20 h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-cyan-400 focus:outline-none"
          />
        </div>

        {/* Expand Now Playing View */}
        <button
          onClick={onOpenNowPlaying}
          className="p-2 text-zinc-400 hover:text-white transition"
          title="Expand Stage"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </footer>
  )
}
