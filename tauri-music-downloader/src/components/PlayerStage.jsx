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
  Download,
  ArrowUp
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
  onBackToLibrary,
  trackIndex = 0,
  totalTracks = 0
}) {
  const [stageMode, setStageMode] = useState('cover') // 'cover' | 'lyrics' | 'visualizer'

  // Gesture handling on album art
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e) => {
    touchEndX.current = e.changedTouches[0].clientX
    const diff = touchStartX.current - touchEndX.current
    if (diff > 50) {
      onNext()
    } else if (diff < -50) {
      onPrev()
    }
  }

  const isFlac = (currentTrack?.file_path || '').toLowerCase().endsWith('.flac') || currentTrack?.source_used?.includes('FLAC')

  return (
    <div className="w-full h-full flex flex-col justify-between bg-poweramp-base text-zinc-100 pt-10 px-4 pb-3 select-none overflow-hidden relative font-sans">
      {/* Dynamic Ambient Glow matching album art */}
      {currentTrack?.cover_path && (
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full blur-[110px] opacity-30 pointer-events-none transition-all duration-1000"
          style={{
            backgroundImage: `url(${currentTrack.cover_path})`,
            backgroundSize: 'cover'
          }}
        />
      )}

      {/* 1. Top Header: Track Counter & Mode Selector */}
      <div className="flex justify-between items-center z-10">
        <div className="flex items-center gap-2.5">
          {onBackToLibrary && (
            <button
              onClick={onBackToLibrary}
              className="poweramp-pill-btn flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white"
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span>Library</span>
            </button>
          )}
          <div className="flex flex-col">
            <span className="text-[10px] font-mono tracking-widest text-cyan-400 font-bold uppercase">
              {totalTracks > 0 ? `${trackIndex + 1} / ${totalTracks}` : 'STANDALONE'}
            </span>
            <span className="text-xs font-semibold text-zinc-400 truncate max-w-[120px]">
              {currentTrack?.album || 'SheroFetch'}
            </span>
          </div>
        </div>

        {/* Tactile Mode Switcher (Cover | Lyrics | Visualizer) */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/60 border border-white/10 backdrop-blur-md shadow-inner">
          <button
            onClick={() => setStageMode('cover')}
            className={`p-1.5 rounded-lg transition-all ${
              stageMode === 'cover'
                ? 'bg-cyan-500 text-black shadow-[0_0_8px_#00e5ff]'
                : 'text-zinc-400 hover:text-white'
            }`}
            title="Cover Art"
          >
            <Disc className="w-4 h-4" />
          </button>
          <button
            onClick={() => setStageMode('lyrics')}
            className={`p-1.5 rounded-lg transition-all ${
              stageMode === 'lyrics'
                ? 'bg-cyan-500 text-black shadow-[0_0_8px_#00e5ff]'
                : 'text-zinc-400 hover:text-white'
            }`}
            title="Lyrics HUD"
          >
            <Mic2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setStageMode('visualizer')}
            className={`p-1.5 rounded-lg transition-all ${
              stageMode === 'visualizer'
                ? 'bg-cyan-500 text-black shadow-[0_0_8px_#00e5ff]'
                : 'text-zinc-400 hover:text-white'
            }`}
            title="Spectrum Visualizer"
          >
            <Activity className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Hero Centerpiece: Album Artwork / Lyrics / Spectrum */}
      <div
        className="flex-1 my-2 flex items-center justify-center relative z-10 min-h-[220px]"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {stageMode === 'cover' && (
          <div
            onClick={() => setStageMode('lyrics')}
            className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-3xl overflow-hidden poweramp-art-frame cursor-pointer transition-transform duration-200 active:scale-95 group"
          >
            {currentTrack?.cover_path ? (
              <img
                src={currentTrack.cover_path}
                alt="Cover"
                className="w-full h-full object-cover select-none pointer-events-none"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-zinc-900 to-black flex flex-col items-center justify-center text-zinc-600 gap-2">
                <Disc className="w-16 h-16 text-zinc-700" />
                <span className="text-xs text-zinc-500 font-mono font-bold tracking-wider uppercase">SheroFetch Hi-Res</span>
              </div>
            )}
            {/* Subtle Gloss Sheen on top edge */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/60 pointer-events-none" />
          </div>
        )}

        {stageMode === 'lyrics' && (
          <div className="w-full h-64 sm:h-72 rounded-3xl bg-black/50 border border-white/10 backdrop-blur-xl overflow-hidden poweramp-art-frame">
            <LyricsHUD lrcText={lrcText} currentTime={currentTime} onSeek={onSeek} />
          </div>
        )}

        {stageMode === 'visualizer' && (
          <div className="w-full h-64 sm:h-72">
            <SpectrumVisualizer isPlaying={isPlaying} />
          </div>
        )}
      </div>

      {/* 3. Track Titles & Poweramp Monospace Audio Spec Bar */}
      <div className="flex flex-col items-center text-center z-10">
        <h3 className="text-lg font-black text-white tracking-wide truncate max-w-xs drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
          {currentTrack?.track || 'Select a Song to Play'}
        </h3>
        <p className="text-xs font-semibold text-zinc-400 truncate max-w-xs mt-0.5">
          {currentTrack?.artist || 'SheroFetch Audiophile Player'}
        </p>

        {/* Poweramp Authentic Monospace Spec Badge */}
        <div className="flex items-center gap-2 mt-2 px-3.5 py-1 rounded-full bg-[#0d1017] border border-white/10 text-[10px] font-mono tracking-wider shadow-inner">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
          <span className={isFlac ? 'text-purple-300 font-bold' : 'text-cyan-300 font-bold'}>
            {isFlac ? 'FLAC | 24-bit / 48.0 kHz' : 'MP3 | 320 kbps'}
          </span>
          <span className="text-zinc-600">•</span>
          <span className="text-zinc-300 uppercase font-black">{isFlac ? '1411 KBPS' : 'STEREO'}</span>
          <span className="text-zinc-600">•</span>
          <span className="text-cyan-400/90 font-bold">Direct HD</span>
        </div>
      </div>

      {/* 4. Canvas Acoustic Waveform Seekbar */}
      <div className="z-10 my-1">
        <WaveformSeekbar
          currentTime={currentTime}
          duration={duration}
          onSeek={onSeek}
          trackId={currentTrack?.id || 'default'}
          isPlaying={isPlaying}
        />
      </div>

      {/* 5. Poweramp Tactile Transport Controls */}
      <div className="flex items-center justify-between z-10 px-2 my-1">
        {/* Shuffle Button with LED Dot */}
        <button
          onClick={onToggleShuffle}
          className="flex flex-col items-center gap-1 p-2 rounded-xl text-zinc-400 hover:text-white transition group"
          title="Shuffle"
        >
          <Shuffle className="w-5 h-5 group-hover:scale-105 transition" />
          <span
            className={`w-1.5 h-1.5 rounded-full transition-all ${
              shuffleMode ? 'bg-cyan-400 led-active' : 'bg-transparent'
            }`}
          />
        </button>

        {/* 10s Rewind */}
        <button
          onClick={() => onSeek(Math.max(0, currentTime - 10))}
          className="p-2.5 rounded-full btn-poweramp-tactile text-zinc-300 hover:text-white transition"
          title="Rewind 10s"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Previous Track */}
        <button
          onClick={onPrev}
          className="p-3 rounded-full btn-poweramp-tactile text-zinc-200 hover:text-white transition"
          title="Previous Track"
        >
          <SkipBack className="w-5 h-5 fill-zinc-200" />
        </button>

        {/* Central Poweramp Play/Pause Dome */}
        <button
          onClick={onTogglePlay}
          className="w-16 h-16 rounded-full poweramp-play-dome text-cyan-400 flex items-center justify-center transition-all duration-150"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="w-7 h-7 fill-cyan-400 drop-shadow-[0_0_8px_#00e5ff]" />
          ) : (
            <Play className="w-7 h-7 fill-cyan-400 translate-x-0.5 drop-shadow-[0_0_8px_#00e5ff]" />
          )}
        </button>

        {/* Next Track */}
        <button
          onClick={onNext}
          className="p-3 rounded-full btn-poweramp-tactile text-zinc-200 hover:text-white transition"
          title="Next Track"
        >
          <SkipForward className="w-5 h-5 fill-zinc-200" />
        </button>

        {/* 10s Fast-Forward */}
        <button
          onClick={() => onSeek(Math.min(duration, currentTime + 10))}
          className="p-2.5 rounded-full btn-poweramp-tactile text-zinc-300 hover:text-white transition"
          title="Forward 10s"
        >
          <RotateCw className="w-4 h-4" />
        </button>

        {/* Repeat Button with LED Dot */}
        <button
          onClick={onToggleRepeat}
          className="flex flex-col items-center gap-1 p-2 rounded-xl text-zinc-400 hover:text-white transition group"
          title={`Repeat: ${repeatMode}`}
        >
          {repeatMode === 'one' ? (
            <Repeat1 className="w-5 h-5 group-hover:scale-105 transition" />
          ) : (
            <Repeat className="w-5 h-5 group-hover:scale-105 transition" />
          )}
          <span
            className={`w-1.5 h-1.5 rounded-full transition-all ${
              repeatMode !== 'off' ? 'bg-cyan-400 led-active' : 'bg-transparent'
            }`}
          />
        </button>
      </div>

      {/* 6. Poweramp Quick Tools: Equalizer & Acquire Trigger */}
      <div className="flex items-center justify-between pt-2 border-t border-white/5 z-10">
        <button
          onClick={onOpenEqualizer}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl btn-poweramp-tactile text-xs font-semibold text-zinc-300 hover:text-white transition"
        >
          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          <span>Equalizer (EQ)</span>
        </button>

        <button
          onClick={onOpenAcquire}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500 text-cyan-400 hover:text-black border border-cyan-400/60 text-xs font-black transition shadow-[0_0_15px_rgba(0,229,255,0.35)] active:scale-95 font-mono"
        >
          <Download className="w-4 h-4" />
          <span>+ ADD SONGS</span>
        </button>
      </div>
    </div>
  )
}
