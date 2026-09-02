import React from 'react'
import { LayoutGrid, BarChart2, Search, Download, Play, Pause } from 'lucide-react'

export function PowerampDock({
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  activeTab,
  onTabChange,
  onTogglePlay,
  onOpenPlayer,
  onOpenAcquire
}) {
  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0

  return (
    <div className="fixed bottom-3 left-3 right-3 z-40 max-w-lg mx-auto select-none">
      <div className="poweramp-bottom-dock flex flex-col p-2.5 pb-2">
        {/* Upper Part: Mini-Player Card */}
        {currentTrack && (
          <div
            onClick={onOpenPlayer}
            className="flex items-center justify-between px-2 py-1.5 cursor-pointer rounded-2xl hover:bg-white/5 transition active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {/* Album Thumbnail with Poweramp rounded-xl */}
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-zinc-800 border border-white/10 flex-shrink-0 shadow-md">
                {currentTrack.cover_path ? (
                  <img
                    src={currentTrack.cover_path}
                    alt="Mini Cover"
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                ) : (
                  <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500">
                    FLAC
                  </div>
                )}
              </div>

              {/* Title & Artist */}
              <div className="min-w-0 flex-1">
                <h5 className="text-xs font-bold text-white truncate tracking-wide">
                  {currentTrack.track || currentTrack.title}
                </h5>
                <p className="text-[11px] text-zinc-400 truncate mt-0.5 font-medium">
                  {currentTrack.artist || 'Unknown artist'}
                </p>
              </div>
            </div>

            {/* Play/Pause Mini Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onTogglePlay()
              }}
              className="p-2 text-white hover:text-cyan-400 transition active:scale-90"
            >
              {isPlaying ? (
                <Pause className="w-6 h-6 fill-white" />
              ) : (
                <Play className="w-6 h-6 fill-white translate-x-0.5" />
              )}
            </button>
          </div>
        )}

        {/* Middle Part: Poweramp Seek Pill */}
        <div className="w-full px-2 py-1.5 flex items-center">
          <div className="relative w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden shadow-inner">
            <div
              className="absolute left-0 top-0 bottom-0 bg-cyan-400 rounded-full shadow-[0_0_6px_#00e5ff]"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        {/* Lower Part: Poweramp Nav Icons + Dedicated Add Songs Button */}
        <div className="flex items-center justify-between px-2 pt-1">
          {/* 1. Grid (Library Categories) */}
          <button
            onClick={() => onTabChange('library')}
            className={`p-2 rounded-xl transition ${
              activeTab === 'library'
                ? 'text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Library"
          >
            <LayoutGrid className="w-6 h-6" />
          </button>

          {/* 2. Equalizer Bars (EQ) */}
          <button
            onClick={() => onTabChange('equalizer')}
            className={`p-2 rounded-xl transition ${
              activeTab === 'equalizer'
                ? 'text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Equalizer"
          >
            <BarChart2 className="w-6 h-6" />
          </button>

          {/* 3. Search (Song search / All songs) */}
          <button
            onClick={() => onTabChange('search')}
            className={`p-2 rounded-xl transition ${
              activeTab === 'search'
                ? 'text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Search"
          >
            <Search className="w-6 h-6" />
          </button>

          {/* 4. PROMINENT ADD & DOWNLOAD SONGS BUTTON */}
          <button
            onClick={onOpenAcquire}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-cyan-500/20 border border-cyan-400/60 text-cyan-400 hover:bg-cyan-500 hover:text-black transition shadow-[0_0_14px_rgba(0,229,255,0.35)] active:scale-95 group"
            title="Add & Download Songs"
          >
            <Download className="w-4 h-4 group-hover:translate-y-0.5 transition" />
            <span className="text-[11px] font-black tracking-wider uppercase font-mono">
              Add Songs
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
