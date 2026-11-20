import React, { useState, useMemo } from 'react'
import {
  Play,
  Pause,
  Music,
  Disc,
  Folder,
  Sliders,
  MoreVertical,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  FileAudio,
  List,
  Grid,
  Filter,
  ArrowUpDown,
  Volume2
} from 'lucide-react'

export function DesktopLibraryView({
  library = [],
  onPlayInPlayer,
  onOpenFolder,
  onOpenAcquire,
  searchQuery = ''
}) {
  const [viewMode, setViewMode] = useState('table') // 'table' | 'grid'
  const [filterSource, setFilterSource] = useState('all') // 'all' | 'p2p' | 'studio' | 'mp3'
  const [sortBy, setSortBy] = useState('recent') // 'recent' | 'title' | 'artist' | 'size'

  // Filtered tracks
  const processedTracks = useMemo(() => {
    let list = [...library]

    // 1. Text Search Filter
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(
        (t) =>
          (t.track || t.title || '').toLowerCase().includes(q) ||
          (t.artist || '').toLowerCase().includes(q) ||
          (t.album || '').toLowerCase().includes(q)
      )
    }

    // 2. Source / Quality Filter
    if (filterSource === 'p2p') {
      list = list.filter((t) => {
        const s = (t.source_used || t.tier || '').toLowerCase()
        return s.includes('soulseek') || s.includes('p2p') || (t.tier === 'green')
      })
    } else if (filterSource === 'studio') {
      list = list.filter((t) => {
        const s = (t.source_used || t.tier || '').toLowerCase()
        return s.includes('youtube') || s.includes('studio') || (t.tier === 'yellow')
      })
    } else if (filterSource === 'mp3') {
      list = list.filter((t) => (t.file_path || '').toLowerCase().endsWith('.mp3'))
    }

    // 3. Sorting
    if (sortBy === 'title') {
      list.sort((a, b) => (a.track || '').localeCompare(b.track || ''))
    } else if (sortBy === 'artist') {
      list.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''))
    } else if (sortBy === 'size') {
      list.sort((a, b) => (b.file_size_mb || 0) - (a.file_size_mb || 0))
    }

    return list
  }, [library, searchQuery, filterSource, sortBy])

  // Aggregate Stats
  const stats = useMemo(() => {
    const totalCount = library.length
    let totalMb = 0
    let p2pCount = 0
    let flacCount = 0

    for (const t of library) {
      totalMb += t.file_size_mb || 0
      const isFlac = (t.file_path || '').toLowerCase().endsWith('.flac')
      if (isFlac) flacCount++
      if (t.tier === 'green' || (t.source_used || '').toLowerCase().includes('soulseek')) {
        p2pCount++
      }
    }

    return {
      totalCount,
      totalGb: (totalMb / 1024).toFixed(2),
      flacRatio: totalCount > 0 ? Math.round((flacCount / totalCount) * 100) : 0,
      p2pCount
    }
  }, [library])

  const formatDuration = (secs) => {
    if (!secs || isNaN(secs)) return '--:--'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  return (
    <div className="w-full h-full flex flex-col bg-[#07080E] text-zinc-100 overflow-y-auto select-none p-3.5 md:p-6 pb-28 md:pb-6 font-sans">
      {/* 1. Header Banner & Vault Metrics */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 pb-4 sm:pb-6 border-b border-white/5">
        <div>
          <div className="flex items-center gap-2 sm:gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">Lossless Vault</h1>
            <span className="text-[10px] sm:text-xs font-mono font-bold px-2 sm:px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              {stats.flacRatio}% FLAC
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-zinc-400 mt-1 font-medium">
            {stats.totalCount} recordings • {stats.totalGb} GB • Bit-Perfect
          </p>
        </div>

        {/* View Mode & Filter Tools */}
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          {/* Source Filter Pills */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/5 flex-1 sm:flex-initial justify-center text-[11px] sm:text-xs font-bold">
            <button
              onClick={() => setFilterSource('all')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg transition-all ${
                filterSource === 'all'
                  ? 'bg-cyan-500 text-black shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              All ({library.length})
            </button>
            <button
              onClick={() => setFilterSource('p2p')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                filterSource === 'p2p'
                  ? 'bg-emerald-500 text-black shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>P2P</span>
            </button>
            <button
              onClick={() => setFilterSource('studio')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                filterSource === 'studio'
                  ? 'bg-amber-500 text-black shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>Studio</span>
            </button>
          </div>

          {/* Table / Grid Toggle (Desktop) */}
          <div className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/5">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition ${
                viewMode === 'table' ? 'bg-white/10 text-cyan-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Detailed Table View"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition ${
                viewMode === 'grid' ? 'bg-white/10 text-cyan-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Album Grid View"
            >
              <Grid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Empty State */}
      {processedTracks.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center py-16 sm:py-20 text-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-3xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-4 shadow-[0_0_30px_rgba(0,229,255,0.2)]">
            <Music className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-white">No tracks match your current filter</h3>
          <p className="text-xs text-zinc-400 max-w-sm mt-1 mb-5">
            Acquire pristine lossless recordings directly from the Soulseek P2P mesh or stream pipelines.
          </p>
          <button
            onClick={onOpenAcquire}
            className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-black transition-all shadow-[0_0_20px_rgba(0,229,255,0.4)] flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>Acquire Songs Now</span>
          </button>
        </div>
      )}

      {/* 2b. Mobile-Optimized List View (Visible on phones) */}
      {processedTracks.length > 0 && (
        <div className="md:hidden mt-3 flex flex-col gap-2">
          {processedTracks.map((track, idx) => {
            const isP2p = track.tier === 'green' || (track.source_used || '').toLowerCase().includes('soulseek')
            const isStudio = track.tier === 'yellow' || (track.source_used || '').toLowerCase().includes('youtube')
            const isMp3 = (track.file_path || '').toLowerCase().endsWith('.mp3')

            return (
              <div
                key={track.id || track.file_path || idx}
                onClick={() => onPlayInPlayer && onPlayInPlayer(track)}
                className="p-3 rounded-2xl bg-white/[0.02] active:bg-white/[0.06] border border-white/5 flex items-center justify-between gap-3 transition cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative w-12 h-12 rounded-xl bg-zinc-900 border border-white/10 overflow-hidden flex-shrink-0 shadow-md">
                    {track.cover_path ? (
                      <img
                        src={track.cover_path}
                        alt="Cover"
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] font-mono font-bold text-zinc-600">
                        FLAC
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <Play className="w-4 h-4 fill-white text-white translate-x-0.5" />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate">
                      {track.track || track.title || 'Unknown Track'}
                    </p>
                    <p className="text-[11px] text-zinc-400 truncate mt-0.5 font-medium">
                      {track.artist || 'Unknown Artist'}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {isP2p ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          P2P FLAC
                        </span>
                      ) : isStudio ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          Studio
                        </span>
                      ) : isMp3 ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                          MP3
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                          Lossless
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-zinc-500">
                        {formatDuration(track.duration)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onPlayInPlayer && onPlayInPlayer(track)
                    }}
                    className="p-2.5 rounded-xl bg-cyan-500/10 active:bg-cyan-500 text-cyan-400 active:text-black border border-cyan-500/20 transition"
                    title="Play Track"
                  >
                    <Play className="w-4 h-4 fill-current" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 3. Detailed Audio Table View (Desktop only) */}
      {processedTracks.length > 0 && viewMode === 'table' && (
        <div className="hidden md:block mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                <th className="py-3 px-3 w-12 text-center">#</th>
                <th className="py-3 px-3">Title & Artist</th>
                <th className="py-3 px-3 hidden md:table-cell">Album</th>
                <th className="py-3 px-3">Quality & Source</th>
                <th className="py-3 px-3 text-right hidden sm:table-cell">Size</th>
                <th className="py-3 px-3 text-right">Duration</th>
                <th className="py-3 px-3 text-center w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.02]">
              {processedTracks.map((track, idx) => {
                const isP2p = track.tier === 'green' || (track.source_used || '').toLowerCase().includes('soulseek')
                const isStudio = track.tier === 'yellow' || (track.source_used || '').toLowerCase().includes('youtube')
                const isMp3 = (track.file_path || '').toLowerCase().endsWith('.mp3')

                return (
                  <tr
                    key={track.id || track.file_path || idx}
                    onClick={() => onPlayInPlayer && onPlayInPlayer(track)}
                    className="group hover:bg-white/[0.04] transition-colors cursor-pointer"
                  >
                    {/* Index / Play Button */}
                    <td className="py-3 px-3 text-center">
                      <div className="relative flex items-center justify-center w-6 h-6 mx-auto">
                        <span className="text-xs font-mono text-zinc-500 group-hover:hidden">
                          {idx + 1}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onPlayInPlayer && onPlayInPlayer(track)
                          }}
                          className="hidden group-hover:flex items-center justify-center w-6 h-6 rounded-full bg-cyan-500 text-black shadow-[0_0_10px_rgba(0,229,255,0.5)] transition"
                          title="Play Track"
                        >
                          <Play className="w-3 h-3 fill-black translate-x-0.5" />
                        </button>
                      </div>
                    </td>

                    {/* Title & Artist & Thumbnail */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/10 overflow-hidden flex-shrink-0 shadow-md">
                          {track.cover_path ? (
                            <img
                              src={track.cover_path}
                              alt="Cover"
                              className="w-full h-full object-cover"
                              onError={(e) => { e.target.style.display = 'none' }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] font-mono font-bold text-zinc-600">
                              FLAC
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate text-white group-hover:text-cyan-400 transition-colors">
                            {track.track || track.title || 'Unknown Track'}
                          </p>
                          <p className="text-[11px] text-zinc-400 truncate mt-0.5 font-medium">
                            {track.artist || 'Unknown Artist'}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Album */}
                    <td className="py-3 px-3 text-xs text-zinc-400 font-medium truncate hidden md:table-cell max-w-xs">
                      {track.album || 'Lossless Single'}
                    </td>

                    {/* Quality & Source Badge */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isP2p ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.15)]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>P2P FLAC</span>
                          </span>
                        ) : isStudio ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            <span>Studio Master</span>
                          </span>
                        ) : isMp3 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">
                            <span>MP3 320k</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30">
                            <span>Lossless</span>
                          </span>
                        )}

                        {track.has_lrc && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-white/[0.04] text-zinc-400 border border-white/5" title="Synced Lyrics (.lrc) present">
                            LRC
                          </span>
                        )}
                        {track.has_cover && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-white/[0.04] text-cyan-400 border border-white/5" title="Studio Cover (.jpg) embedded">
                            ART
                          </span>
                        )}
                      </div>
                    </td>

                    {/* File Size */}
                    <td className="py-3 px-3 text-right text-xs font-mono text-zinc-400 hidden sm:table-cell">
                      {track.file_size_mb ? `${track.file_size_mb.toFixed(1)} MB` : '--'}
                    </td>

                    {/* Duration */}
                    <td className="py-3 px-3 text-right text-xs font-mono text-zinc-400">
                      {formatDuration(track.duration)}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onPlayInPlayer && onPlayInPlayer(track)
                          }}
                          className="p-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-black border border-cyan-500/20 transition-all shadow-sm"
                          title="Play Track"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpenFolder && onOpenFolder(track.folder_path)
                          }}
                          className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.15] text-zinc-400 hover:text-white border border-white/5 transition-all"
                          title="Reveal folder in Nautilus"
                        >
                          <Folder className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. Luxury Album Grid View */}
      {processedTracks.length > 0 && viewMode === 'grid' && (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {processedTracks.map((track, idx) => {
            return (
              <div
                key={track.id || track.file_path || idx}
                onClick={() => onPlayInPlayer && onPlayInPlayer(track)}
                className="group relative p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-cyan-500/40 transition-all duration-300 cursor-pointer flex flex-col gap-2.5 shadow-lg"
              >
                <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-zinc-900 border border-white/5 shadow-inner">
                  {track.cover_path ? (
                    <img
                      src={track.cover_path}
                      alt="Cover"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-700">
                      <Disc className="w-12 h-12" />
                    </div>
                  )}

                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-xs gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onPlayInPlayer && onPlayInPlayer(track)
                      }}
                      className="w-11 h-11 rounded-full bg-cyan-500 text-black flex items-center justify-center shadow-[0_0_20px_rgba(0,229,255,0.6)] transform scale-90 group-hover:scale-100 transition-transform"
                      title="Play Track"
                    >
                      <Play className="w-4 h-4 fill-black translate-x-0.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenFolder && onOpenFolder(track.folder_path)
                      }}
                      className="w-9 h-9 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-white flex items-center justify-center border border-white/10 transition-transform"
                      title="Reveal in Files"
                    >
                      <Folder className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-white truncate group-hover:text-cyan-400 transition-colors">
                    {track.track || track.title || 'Unknown Track'}
                  </h4>
                  <p className="text-[11px] text-zinc-400 truncate mt-0.5 font-medium">
                    {track.artist || 'Unknown Artist'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
