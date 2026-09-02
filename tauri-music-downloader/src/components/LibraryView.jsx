import React, { useState, useMemo } from 'react'
import {
  Search,
  Music,
  Disc,
  User,
  Folder,
  ShieldCheck,
  Play,
  MoreVertical,
  Clock,
  Sparkles,
  Trash2,
  ListMusic
} from 'lucide-react'

export function LibraryView({
  library = [],
  currentTrack = null,
  isPlaying = false,
  onSelectTrack,
  onOpenAcquire,
  onDeleteTrack
}) {
  const [activeCategory, setActiveCategory] = useState('all') // 'all' | 'albums' | 'artists' | 'folders' | 'flac'
  const [filterQuery, setFilterQuery] = useState('')
  const [menuOpenId, setMenuOpenId] = useState(null)

  // Filtered tracks based on search query and category
  const filteredTracks = useMemo(() => {
    let list = [...library]

    // Category filter
    if (activeCategory === 'flac') {
      list = list.filter((t) => (t.file_path || '').toLowerCase().endsWith('.flac') || t.source_used?.includes('FLAC'))
    }

    // Search query filter
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase().trim()
      list = list.filter(
        (t) =>
          (t.track || '').toLowerCase().includes(q) ||
          (t.artist || '').toLowerCase().includes(q) ||
          (t.album || '').toLowerCase().includes(q)
      )
    }

    return list
  }, [library, activeCategory, filterQuery])

  // Unique Albums
  const albums = useMemo(() => {
    const map = new Map()
    for (const t of library) {
      const key = `${t.album || 'Unknown Album'} - ${t.artist || 'Unknown Artist'}`
      if (!map.has(key)) {
        map.set(key, { album: t.album || 'Unknown Album', artist: t.artist || 'Unknown Artist', cover: t.cover_path, tracks: [] })
      }
      map.get(key).tracks.push(t)
    }
    return Array.from(map.values())
  }, [library])

  // Unique Artists
  const artists = useMemo(() => {
    const map = new Map()
    for (const t of library) {
      const key = t.artist || 'Unknown Artist'
      if (!map.has(key)) {
        map.set(key, { artist: key, cover: t.cover_path, tracks: [] })
      }
      map.get(key).tracks.push(t)
    }
    return Array.from(map.values())
  }, [library])

  const formatDuration = (secs) => {
    if (!secs) return '--:--'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  return (
    <div className="w-full h-full flex flex-col bg-[#07080B] text-zinc-100 pt-10 px-4 pb-4 select-none overflow-hidden">
      {/* Search & Ingestion Bar */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Search library by song, artist, album..."
            className="w-full bg-zinc-900/80 border border-white/10 rounded-2xl pl-10 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <button
          onClick={onOpenAcquire}
          className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs shadow-[0_0_12px_rgba(0,229,255,0.3)] transition"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Acquire</span>
        </button>
      </div>

      {/* Category Tabs (Poweramp Navigation Hierarchy) */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-2 no-scrollbar">
        {[
          { id: 'all', label: 'All Songs', icon: Music, count: library.length },
          { id: 'flac', label: 'Lossless Vault', icon: ShieldCheck, count: library.filter(t => (t.file_path || '').endsWith('.flac')).length },
          { id: 'albums', label: 'Albums', icon: Disc, count: albums.length },
          { id: 'artists', label: 'Artists', icon: User, count: artists.length },
          { id: 'folders', label: 'Folders', icon: Folder, count: null }
        ].map((cat) => {
          const Icon = cat.icon
          const isSel = activeCategory === cat.id
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 border ${
                isSel
                  ? 'bg-cyan-500 text-black border-cyan-400 shadow-[0_0_10px_rgba(0,229,255,0.4)]'
                  : 'bg-white/5 text-zinc-400 border-white/10 hover:bg-white/10'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{cat.label}</span>
              {cat.count !== null && (
                <span className={`text-[10px] ml-0.5 px-1.5 py-0.2 rounded-full ${isSel ? 'bg-black/20 text-black' : 'bg-white/10 text-zinc-300'}`}>
                  {cat.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar">
        {/* VIEW 1: All Tracks / FLAC Vault */}
        {(activeCategory === 'all' || activeCategory === 'flac') && (
          <>
            {filteredTracks.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-zinc-500 gap-2">
                <Music className="w-10 h-10 text-zinc-600" />
                <p className="text-sm font-semibold">No tracks found in library</p>
                <button
                  onClick={onOpenAcquire}
                  className="mt-2 px-4 py-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-xs font-bold"
                >
                  Acquire Your First Track
                </button>
              </div>
            ) : (
              filteredTracks.map((t, i) => {
                const isCurrent = currentTrack && (currentTrack.id === t.id || currentTrack.file_path === t.file_path)
                const isFlac = (t.file_path || '').toLowerCase().endsWith('.flac') || t.source_used?.includes('FLAC')

                return (
                  <div
                    key={t.id || i}
                    onClick={() => onSelectTrack(t)}
                    className={`relative flex items-center justify-between p-2.5 rounded-2xl transition cursor-pointer border ${
                      isCurrent
                        ? 'bg-cyan-950/30 border-cyan-500/40 shadow-[0_0_15px_rgba(0,229,255,0.15)]'
                        : 'bg-zinc-900/40 hover:bg-zinc-800/60 border-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Album Art Thumbnail */}
                      <div className="relative w-12 h-12 flex-shrink-0 rounded-xl overflow-hidden bg-zinc-800 border border-white/10 shadow-md">
                        {t.cover_path ? (
                          <img
                            src={t.cover_path}
                            alt="Cover"
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.style.display = 'none' }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600">
                            <Disc className="w-6 h-6" />
                          </div>
                        )}
                        {isCurrent && isPlaying && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <div className="w-3 h-3 rounded-full bg-cyan-400 animate-ping" />
                          </div>
                        )}
                      </div>

                      {/* Track Details */}
                      <div className="min-w-0 flex-1">
                        <h4 className={`text-sm font-bold truncate ${isCurrent ? 'text-cyan-400' : 'text-zinc-100'}`}>
                          {t.track}
                        </h4>
                        <p className="text-xs text-zinc-400 truncate mt-0.5">
                          {t.artist} <span className="text-zinc-600">•</span> {t.album || 'Single'}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={`text-[9px] font-black px-1.5 py-0.5 rounded tracking-wider ${
                              isFlac
                                ? 'bg-purple-950/60 text-purple-300 border border-purple-500/30'
                                : 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {isFlac ? 'FLAC' : '320K'}
                          </span>
                          {t.has_lrc && (
                            <span className="text-[9px] font-bold text-cyan-400/80">LRC</span>
                          )}
                          <span className="text-[10px] text-zinc-500 flex items-center gap-0.5 font-mono">
                            <Clock className="w-2.5 h-2.5" />
                            {formatDuration(t.duration)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Menu */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setMenuOpenId(menuOpenId === t.id ? null : t.id)
                      }}
                      className="p-2 text-zinc-500 hover:text-white rounded-lg transition"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {/* Track Dropdown Popup */}
                    {menuOpenId === t.id && (
                      <div
                        className="absolute right-4 top-12 z-30 w-36 bg-[#0E121B] border border-white/10 rounded-xl shadow-2xl p-1 animate-in fade-in zoom-in-95"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => {
                            onSelectTrack(t)
                            setMenuOpenId(null)
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-white/5 rounded-lg transition"
                        >
                          <Play className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Play Now</span>
                        </button>
                        {onDeleteTrack && (
                          <button
                            onClick={() => {
                              onDeleteTrack(t)
                              setMenuOpenId(null)
                            }}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-rose-400 hover:bg-rose-950/30 rounded-lg transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </>
        )}

        {/* VIEW 2: Albums Grid */}
        {activeCategory === 'albums' && (
          <div className="grid grid-cols-2 gap-3 pb-4">
            {albums.map((alb, i) => (
              <div
                key={i}
                onClick={() => {
                  if (alb.tracks[0]) onSelectTrack(alb.tracks[0])
                }}
                className="flex flex-col p-3 rounded-2xl bg-zinc-900/40 hover:bg-zinc-800/60 border border-white/5 cursor-pointer group transition"
              >
                <div className="aspect-square w-full rounded-xl overflow-hidden bg-zinc-800 mb-2.5 relative border border-white/10 shadow-lg">
                  {alb.cover ? (
                    <img src={alb.cover} alt="Album" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600">
                      <Disc className="w-10 h-10" />
                    </div>
                  )}
                  <div className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-[10px] font-mono font-bold text-white">
                    {alb.tracks.length} tracks
                  </div>
                </div>
                <h5 className="text-xs font-bold text-white truncate">{alb.album}</h5>
                <p className="text-[11px] text-zinc-400 truncate mt-0.5">{alb.artist}</p>
              </div>
            ))}
          </div>
        )}

        {/* VIEW 3: Artists List */}
        {activeCategory === 'artists' && (
          <div className="space-y-2 pb-4">
            {artists.map((art, i) => (
              <div
                key={i}
                onClick={() => {
                  if (art.tracks[0]) onSelectTrack(art.tracks[0])
                }}
                className="flex items-center justify-between p-3 rounded-2xl bg-zinc-900/40 hover:bg-zinc-800/60 border border-white/5 cursor-pointer transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-800 border border-white/10 flex items-center justify-center text-zinc-500">
                    {art.cover ? (
                      <img src={art.cover} alt="Artist" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-white">{art.artist}</h5>
                    <p className="text-xs text-zinc-500">{art.tracks.length} songs in vault</p>
                  </div>
                </div>
                <Play className="w-4 h-4 text-cyan-400 mr-2" />
              </div>
            ))}
          </div>
        )}

        {/* VIEW 4: Folders */}
        {activeCategory === 'folders' && (
          <div className="p-4 rounded-2xl bg-zinc-900/30 border border-white/10 space-y-3">
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold">
              <Folder className="w-4 h-4" />
              <span>Storage Locations</span>
            </div>
            <div className="p-3 rounded-xl bg-black/40 border border-white/5 text-xs font-mono text-zinc-400">
              <p className="font-bold text-white">Android Public Storage:</p>
              <p className="text-cyan-400 mt-1">/sdcard/Documents/SheroFetch/Music/</p>
              <p className="text-[10px] text-zinc-500 mt-1">Directly accessible by Samsung My Files, VLC, and Poweramp.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
