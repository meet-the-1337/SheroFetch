import React, { useState, useRef } from 'react'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Repeat,
  Repeat1,
  Shuffle,
  Disc,
  Mic2,
  Sliders,
  Activity,
  Sparkles,
  Volume2
} from 'lucide-react'
import { WaveformSeekbar } from './WaveformSeekbar'
import { LyricsHUD } from './LyricsHUD'
import { SpectrumVisualizer } from './SpectrumVisualizer'

export function PlayerStage({
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  lrcText,
  repeatMode, // 'off' | 'all' | 'one'
  shuffleMode, // false | true
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
  onToggleRepeat,
  onToggleShuffle,
  onOpenEqualizer,
  onOpenAcquire,
  trackIndex = 0,
  totalTracks = 0
}) {
  // Center stage display mode: 'cover' | 'lyrics' | 'visualizer'
  const [stageMode, setStageMode] = useState('cover')

  // Swipe detection on album cover
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e) => {
    touchEndX.current = e.changedTouches[0].clientX
    const diff = touchStartX.current - touchEndX.current
    if (diff > 50) {
      onNext() // Swipe left -> Next track
    } else if (diff < -50) {
      onPrev() // Swipe right -> Prev track
    }
  }

  const isFlac = (currentTrack?.file_path || '').toLowerCase().endsWith('.flac') || currentTrack?.source_used?.includes('FLAC')

  return (
    <div className="w-full h-full flex flex-col justify-between bg-[#07080B] text-zinc-100 pt-10 px-4 pb-4 select-none overflow-hidden relative">
      {/* Ambient Backlight Glow behind Album Artwork */}
      {currentTrack?.cover_path && (
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full blur-[90px] opacity-25 pointer-events-none transition-all duration-700"
          style={{
            backgroundImage: `url(${currentTrack.cover_path})`,
            backgroundSize: 'cover'
          }}
        />
      )}

      {/* 1. Top Header: Track Counter & Breadcrumb */}
      <div className="flex justify-between items-center z-10 pt-1 pb-2">
        <div className="flex flex-col">
          <span className="text-[10px] font-mono tracking-widest text-cyan-400 font-bold uppercase">
            NOW PLAYING • {totalTracks > 0 ? `${trackIndex + 1} / ${totalTracks}` : 'STANDALONE'}
          </span>
          <span className="text-xs font-semibold text-zinc-400 truncate max-w-[220px]">
            {currentTrack?.album || 'SheroFetch Vault'}
          </span>
        </div>

        {/* Stage Mode Switcher (Cover | Lyrics | Visualizer) */}
        <div className="flex items-center gap-1 bg-black/40 border border-white/10 p-1 rounded-xl backdrop-blur-md">
          <button
            onClick={() => setStageMode('cover')}
            className={`p-1.5 rounded-lg transition ${
              stageMode === 'cover' ? 'bg-cyan-500 text-black shadow-[0_0_8px_rgba(0,229,255,0.4)]' : 'text-zinc-400 hover:text-white'
            }`}
            title="Album Artwork"
          >
            <Disc className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setStageMode('lyrics')}
            className={`p-1.5 rounded-lg transition ${
              stageMode === 'lyrics' ? 'bg-cyan-500 text-black shadow-[0_0_8px_rgba(0,229,255,0.4)]' : 'text-zinc-400 hover:text-white'
            }`}
            title="Synchronized Lyrics"
          >
            <Mic2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setStageMode('visualizer')}
            className={`p-1.5 rounded-lg transition ${
              stageMode === 'visualizer' ? 'bg-cyan-500 text-black shadow-[0_0_8px_rgba(0,229,255,0.4)]' : 'text-zinc-400 hover:text-white'
            }`}
            title="Audio Spectrum"
          >
            <Activity className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Hero Stage: Album Art / Lyrics HUD / Spectrum Visualizer */}
      <div
        className="flex-1 my-2 flex items-center justify-center relative z-10 min-h-[220px]"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {stageMode === 'cover' && (
          <div
            onClick={() => setStageMode('lyrics')}
            className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-3xl overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.8)] border border-white/10 cursor-pointer group transition-all duration-300 active:scale-95"
          >
            {currentTrack?.cover_path ? (
              <img
                src={currentTrack.cover_path}
                alt="Cover"
                className="w-full h-full object-cover select-none pointer-events-none"
              />
            ) : (
              <div className="w-full h-full bg-zinc-900 flex flex-col items-center justify-center text-zinc-600 gap-2">
                <Disc className="w-16 h-16" />
                <span className="text-xs text-zinc-500 font-medium">SheroFetch Hi-Res</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition flex items-end p-4">
              <span className="text-xs text-cyan-300 font-medium flex items-center gap-1.5">
                <Mic2 className="w-3.5 h-3.5" /> Tap to view lyrics
              </span>
            </div>
          </div>
        )}

        {stageMode === 'lyrics' && (
          <div className="w-full h-64 sm:h-72 rounded-3xl bg-black/40 border border-white/10 backdrop-blur-xl overflow-hidden">
            <LyricsHUD lrcText={lrcText} currentTime={currentTime} onSeek={onSeek} />
          </div>
        )}

        {stageMode === 'visualizer' && (
          <div className="w-full h-64 sm:h-72">
            <SpectrumVisualizer isPlaying={isPlaying} />
          </div>
        )}
      </div>

      {/* 3. Track Metadata & Audiophile Spec Pill */}
      <div className="flex flex-col items-center text-center z-10 my-1">
        <h3 className="text-lg font-black text-white tracking-wide truncate max-w-xs drop-shadow-md">
          {currentTrack?.track || 'Select a Song to Play'}
        </h3>
        <p className="text-xs font-semibold text-zinc-400 truncate max-w-xs mt-0.5">
          {currentTrack?.artist || 'SheroFetch Audiophile Player'}
        </p>

        {/* Poweramp Hi-Res Spec Pill */}
        <div className="flex items-center gap-2 mt-2 px-3 py-1 rounded-full bg-zinc-900/80 border border-white/10 text-[10px] font-mono tracking-wider shadow-inner">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className={isFlac ? 'text-purple-300 font-bold' : 'text-cyan-300 font-bold'}>
            {isFlac ? '24-bit • 48.0 kHz' : '320 kbps • MP3'}
          </span>
          <span className="text-zinc-600">|</span>
          <span className="text-zinc-300 uppercase font-black">{isFlac ? 'FLAC' : 'STEREO'}</span>
          <span className="text-zinc-600">|</span>
          <span className="text-zinc-400">Bit-Perfect Engine</span>
        </div>
      </div>

      {/* 4. Poweramp 60-Bar Acoustic Waveform Seekbar */}
      <div className="z-10 my-1">
        <WaveformSeekbar
          currentTime={currentTime}
          duration={duration}
          onSeek={onSeek}
          trackId={currentTrack?.id || 'default'}
          isPlaying={isPlaying}
        />
      </div>

      {/* 5. Poweramp Iconic Transport Playback Controls */}
      <div className="flex items-center justify-between z-10 px-2 my-1">
        {/* Shuffle Mode Toggle */}
        <button
          onClick={onToggleShuffle}
          className={`p-2.5 rounded-full transition ${
            shuffleMode
              ? 'text-cyan-400 bg-cyan-950/40 border border-cyan-500/30 shadow-[0_0_10px_rgba(0,229,255,0.3)]'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          title="Shuffle"
        >
          <Shuffle className="w-5 h-5" />
        </button>

        {/* 10s Rewind */}
        <button
          onClick={() => onSeek(Math.max(0, currentTime - 10))}
          className="p-2 text-zinc-400 hover:text-white transition active:scale-95"
          title="Rewind 10s"
        >
          <RotateCcw className="w-5 h-5" />
        </button>

        {/* Previous Track */}
        <button
          onClick={onPrev}
          className="p-2.5 rounded-full text-zinc-200 hover:text-white transition active:scale-90"
          title="Previous Track"
        >
          <SkipBack className="w-6 h-6 fill-zinc-200" />
        </button>

        {/* Central Glowing Circular Play/Pause Button */}
        <button
          onClick={onTogglePlay}
          className="w-16 h-16 rounded-full bg-cyan-400 hover:bg-cyan-300 text-black flex items-center justify-center shadow-[0_0_20px_#00E5FF,0_0_35px_rgba(0,229,255,0.5)] active:scale-90 transition-all duration-150 border-2 border-white/80"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="w-7 h-7 fill-black" />
          ) : (
            <Play className="w-7 h-7 fill-black translate-x-0.5" />
          )}
        </button>

        {/* Next Track */}
        <button
          onClick={onNext}
          className="p-2.5 rounded-full text-zinc-200 hover:text-white transition active:scale-90"
          title="Next Track"
        >
          <SkipForward className="w-6 h-6 fill-zinc-200" />
        </button>

        {/* 10s Fast-Forward */}
        <button
          onClick={() => onSeek(Math.min(duration, currentTime + 10))}
          className="p-2 text-zinc-400 hover:text-white transition active:scale-95"
          title="Forward 10s"
        >
          <RotateCw className="w-5 h-5" />
        </button>

        {/* Repeat Mode Toggle */}
        <button
          onClick={onToggleRepeat}
          className={`p-2.5 rounded-full transition ${
            repeatMode !== 'off'
              ? 'text-cyan-400 bg-cyan-950/40 border border-cyan-500/30 shadow-[0_0_10px_rgba(0,229,255,0.3)]'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          title={`Repeat: ${repeatMode}`}
        >
          {repeatMode === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
        </button>
      </div>

      {/* 6. Poweramp Quick Tools: Equalizer + Acquire Trigger */}
      <div className="flex items-center justify-between pt-2 border-t border-white/5 z-10 px-1">
        <button
          onClick={onOpenEqualizer}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-300 transition"
        >
          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          <span>Equalizer (EQ)</span>
        </button>

        <button
          onClick={onOpenAcquire}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-black border border-cyan-500/30 text-xs font-bold transition shadow-[0_0_10px_rgba(0,229,255,0.15)]"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>⚡ Acquire Songs</span>
        </button>
      </div>
    </div>
  )
}
