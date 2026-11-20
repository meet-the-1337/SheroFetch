import React, { useState, useEffect } from 'react'
import {
  Disc,
  Mic2,
  Activity,
  Info,
  Heart,
  Folder,
  Sliders,
  Sparkles,
  FileAudio,
  CheckCircle2
} from 'lucide-react'
import { LyricsHUD } from './LyricsHUD'
import { SpectrumVisualizer } from './SpectrumVisualizer'

export function DesktopNowPlayingView({
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  lrcText,
  onSeek,
  onOpenEqualizer,
  onOpenFolder
}) {
  const [stageTab, setStageTab] = useState('lyrics') // 'lyrics' | 'visualizer' | 'info'
  const [resolvedCover, setResolvedCover] = useState(null)
  const [isLiked, setIsLiked] = useState(false)

  useEffect(() => {
    let active = true
    const c = currentTrack?.cover_path
    if (c && !c.startsWith('http://127.0.0.1') && !c.startsWith('http://localhost')) {
      setResolvedCover(c)
    } else {
      setResolvedCover(null)
      if (currentTrack?.artist && currentTrack?.track) {
        const q = encodeURIComponent(`${currentTrack.artist} ${currentTrack.track}`)
        fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=1`)
          .then((r) => r.json())
          .then((d) => {
            if (active && d?.results?.[0]?.artworkUrl100) {
              const hiRes = d.results[0].artworkUrl100.replace('100x100bb.jpg', '1000x1000bb.jpg')
              setResolvedCover(hiRes)
            }
          })
          .catch(() => {})
      }
    }
    return () => { active = false }
  }, [currentTrack])

  const isP2p = currentTrack?.tier === 'green' || (currentTrack?.source_used || '').toLowerCase().includes('soulseek')
  const isFlac = (currentTrack?.file_path || '').toLowerCase().endsWith('.flac')

  return (
    <div className="w-full h-full flex flex-col md:flex-row bg-[#07080E] text-zinc-100 overflow-hidden select-none p-8 gap-8 font-sans relative">
      {/* Dynamic Ambient Glow matching artwork */}
      {resolvedCover && (
        <div
          className="absolute top-1/2 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-20 pointer-events-none blur-3xl transition-all duration-700"
          style={{
            background: 'radial-gradient(circle, rgba(0, 229, 255, 0.4) 0%, rgba(168, 85, 247, 0.2) 50%, transparent 70%)'
          }}
        />
      )}

      {/* 1. Left Side: Massive High-End Album Artwork & Audio Specs */}
      <div className="w-full md:w-5/12 flex flex-col items-center justify-center gap-6 z-10">
        <div className="relative w-64 h-64 sm:w-80 sm:h-80 rounded-3xl overflow-hidden bg-zinc-900 border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.9),0_0_30px_rgba(0,229,255,0.15)] group transition-transform duration-300 hover:scale-[1.02]">
          {resolvedCover ? (
            <img
              src={resolvedCover}
              alt="Cover"
              className="w-full h-full object-cover"
              onError={(e) => { e.target.style.display = 'none' }}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 gap-3 bg-gradient-to-br from-zinc-900 to-black">
              <Disc className={`w-20 h-20 text-zinc-700 ${isPlaying ? 'animate-spin-slow' : ''}`} />
              <span className="text-xs font-mono font-bold text-zinc-500 uppercase tracking-widest">
                SheroFetch Lossless
              </span>
            </div>
          )}

          {/* Vinyl Reflection Overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-black/40 via-transparent to-white/10 pointer-events-none" />
        </div>

        {/* Track Title & Artist */}
        <div className="text-center max-w-sm">
          <h2 className="text-xl font-black text-white truncate tracking-tight">
            {currentTrack?.track || currentTrack?.title || 'No Track Selected'}
          </h2>
          <p className="text-sm font-semibold text-zinc-400 truncate mt-1">
            {currentTrack?.artist || 'Select a song from your Vault'}
          </p>
          <p className="text-xs text-zinc-500 font-medium truncate mt-0.5">
            {currentTrack?.album || 'Lossless Vault'}
          </p>
        </div>

        {/* Audiophile Spec Badges */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shadow-[0_0_10px_rgba(0,229,255,0.15)]">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>{isFlac ? 'FLAC 24-bit / 96kHz' : '320kbps MP3'}</span>
          </span>

          {isP2p ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Soulseek P2P Verified</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>Studio Master Stream</span>
            </span>
          )}
        </div>
      </div>

      {/* 2. Right Side: Multi-Function Stage (Lyrics | Visualizer | Technical Info) */}
      <div className="w-full md:w-7/12 flex flex-col h-full bg-[#0A0D15]/80 backdrop-blur-2xl border border-white/5 rounded-3xl overflow-hidden shadow-2xl z-10">
        {/* Stage Tabs */}
        <div className="h-14 px-6 border-b border-white/5 flex items-center justify-between flex-shrink-0 bg-white/[0.01]">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-black/60 border border-white/5">
            <button
              onClick={() => setStageTab('lyrics')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                stageTab === 'lyrics'
                  ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(0,229,255,0.4)]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Mic2 className="w-3.5 h-3.5" />
              <span>Synced Lyrics</span>
            </button>
            <button
              onClick={() => setStageTab('visualizer')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                stageTab === 'visualizer'
                  ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(0,229,255,0.4)]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>60 FPS Spectrum</span>
            </button>
            <button
              onClick={() => setStageTab('info')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                stageTab === 'info'
                  ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(0,229,255,0.4)]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Info className="w-3.5 h-3.5" />
              <span>Track Specs</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsLiked(!isLiked)}
              className={`p-2 rounded-xl border transition ${
                isLiked
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                  : 'bg-white/[0.02] hover:bg-white/[0.06] text-zinc-400 hover:text-white border-white/5'
              }`}
              title="Add to Favorites"
            >
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-rose-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Stage Content */}
        <div className="flex-1 overflow-hidden p-6 relative">
          {stageTab === 'lyrics' && (
            <div className="w-full h-full">
              <LyricsHUD lrcText={lrcText} currentTime={currentTime} onSeek={onSeek} />
            </div>
          )}

          {stageTab === 'visualizer' && (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <SpectrumVisualizer isPlaying={isPlaying} />
            </div>
          )}

          {stageTab === 'info' && (
            <div className="w-full h-full overflow-y-auto space-y-4 text-xs font-mono text-zinc-300">
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider text-cyan-400">
                  FILE & ENCODING METRICS
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-zinc-500 text-[10px] block">CODEC</span>
                    <span className="font-bold text-white">{isFlac ? 'Free Lossless Audio Codec (FLAC)' : 'MPEG Audio (MP3)'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px] block">BIT DEPTH / RATE</span>
                    <span className="font-bold text-emerald-400">{isFlac ? '24-bit / 1411+ kbps' : '16-bit / 320 kbps'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px] block">SAMPLE RATE</span>
                    <span className="font-bold text-white">96,000 Hz / 44,100 Hz</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px] block">FILE SIZE</span>
                    <span className="font-bold text-white">{currentTrack?.file_size_mb ? `${currentTrack.file_size_mb.toFixed(2)} MB` : 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                <span className="text-zinc-500 text-[10px] block">DISK PATH</span>
                <p className="text-[11px] text-zinc-300 break-all bg-black/40 p-2.5 rounded-xl border border-white/5">
                  {currentTrack?.file_path || 'Not on disk'}
                </p>
              </div>

              {currentTrack?.mbid && (
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                  <span className="text-zinc-500 text-[10px] block">MUSICBRAINZ RECORDING ID</span>
                  <p className="text-[11px] text-zinc-300 bg-black/40 p-2.5 rounded-xl border border-white/5">
                    {currentTrack.mbid}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
