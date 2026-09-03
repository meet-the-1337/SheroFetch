import React, { useState, useMemo } from 'react'
import {
  Music,
  Folder,
  FolderTree,
  Disc,
  Mic,
  Guitar,
  Calendar,
  User,
  MoreVertical,
  Shuffle,
  Play,
  Search,
  CheckSquare,
  ArrowUp,
  Sparkles,
  Download,
  X
} from 'lucide-react'

export function LibraryView({
  library = [],
  currentTrack = null,
  isPlaying = false,
  onSelectTrack,
  onOpenAcquire,
  onOpenProfile,
  soulseekProfile = null,
  initialCategory = null
}) {
  // Navigation: null = Category Index (Screenshot 4), or 'all' | 'folders' | 'albums' | 'artists' (Screenshots 1 & 3)
  const [selectedCategory, setSelectedCategory] = useState(initialCategory)
  const [searchQuery, setSearchQuery] = useState('')

  // Unique Albums
  const albums = useMemo(() => {
    const map = new Map()
    for (const t of library) {
      const key = `${t.album || 'Unknown Album'} - ${t.artist || 'Unknown Artist'}`
      if (!map.has(key)) {
        map.set(key, {
          album: t.album || 'Unknown Album',
          artist: t.artist || 'Unknown Artist',
          cover: t.cover_path,
          year: t.year || '2026',
          tracks: []
        })
      }
      map.get(key).tracks.push(t)
    }
    return Array.from(map.values())
  }, [library])

  // Filtered tracks for "All Songs" view
  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return library
    const q = searchQuery.toLowerCase().trim()
    return library.filter(
      (t) =>
        (t.track || '').toLowerCase().includes(q) ||
        (t.artist || '').toLowerCase().includes(q) ||
        (t.album || '').toLowerCase().includes(q)
    )
  }, [library, searchQuery])

  const formatDuration = (secs) => {
    if (!secs) return '--:--'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  // ==========================================
  // VIEW 1: Main Category Index (Screenshot 4)
  // ==========================================
  if (!selectedCategory) {
    const categories = [
      {
        id: 'acquire',
        label: '📥 Download & Add Songs',
        sublabel: 'Search, Spotify/YT Link, CSV Batch',
        icon: Download,
        color: 'bg-cyan-500 shadow-[0_0_15px_rgba(0,229,255,0.4)]'
      },
      { id: 'all', label: 'All Songs', icon: Music, color: 'bg-blue-600' },
      { id: 'folders', label: 'Folders', icon: Folder, color: 'bg-blue-500' },
      { id: 'folders_hier', label: 'Folders Hierarchy', icon: FolderTree, color: 'bg-blue-700' },
      { id: 'albums', label: 'Albums', icon: Disc, color: 'bg-indigo-600' },
      { id: 'artists', label: 'Artists', icon: Mic, color: 'bg-purple-600' },
      { id: 'album_artists', label: 'Album Artists', icon: Mic, color: 'bg-purple-500' },
      { id: 'genres', label: 'Genres', icon: Guitar, color: 'bg-fuchsia-600' },
      { id: 'years', label: 'Years', icon: Calendar, color: 'bg-teal-600' },
      { id: 'composers', label: 'Composers', icon: User, color: 'bg-emerald-600' }
    ]

    return (
      <div className="w-full h-full flex flex-col bg-[#07080b] text-white pt-10 px-4 pb-28 select-none overflow-y-auto font-sans">
        {/* Top Header with Dedicated Add Songs Button */}
        <div className="flex justify-between items-center py-2 px-1 mb-2">
          <h1 className="text-2xl font-black tracking-tight text-white">Library</h1>
          <div className="flex items-center gap-2">
            {onOpenProfile && (
              <button
                onClick={onOpenProfile}
                className="p-1.5 rounded-xl bg-zinc-900 border border-white/10 hover:border-cyan-500/40 text-zinc-300 hover:text-white transition flex items-center gap-1.5 px-2"
                title="Audiophile Profile & Open-Source Stack"
              >
                <User className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[11px] font-bold max-w-[65px] truncate">
                  {soulseekProfile?.username ? `@${soulseekProfile.username}` : 'Profile'}
                </span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    soulseekProfile?.logged_in ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'
                  }`}
                />
              </button>
            )}
            <button
              onClick={onOpenAcquire}
              className="poweramp-pill-btn flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan-500/20 border-cyan-400/60 text-cyan-400 hover:bg-cyan-500 hover:text-black transition shadow-[0_0_14px_rgba(0,229,255,0.35)] text-xs font-black font-mono tracking-wide"
            >
              <Download className="w-3.5 h-3.5" />
              <span>+ ADD SONGS</span>
            </button>
            <button
              onClick={onOpenAcquire}
              className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition"
            >
              <MoreVertical className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Categories List */}
        <div className="space-y-3">
          {categories.map((cat) => {
            const Icon = cat.icon
            return (
              <div
                key={cat.id}
                onClick={() => {
                  if (cat.id === 'acquire') {
                    onOpenAcquire()
                  } else {
                    setSelectedCategory(cat.id === 'folders_hier' ? 'folders' : cat.id)
                  }
                }}
                className={`flex items-center gap-4 p-2.5 rounded-2xl hover:bg-white/5 cursor-pointer transition active:scale-[0.99] ${
                  cat.id === 'acquire' ? 'bg-cyan-500/10 border border-cyan-500/30' : ''
                }`}
              >
                <div className={`w-11 h-11 rounded-full ${cat.color} flex items-center justify-center text-white shadow-lg flex-shrink-0`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex flex-col">
                  <span className={`text-base font-bold tracking-wide ${cat.id === 'acquire' ? 'text-cyan-400' : 'text-white'}`}>
                    {cat.label}
                  </span>
                  {cat.sublabel && (
                    <span className="text-[11px] text-zinc-400 font-medium">
                      {cat.sublabel}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ==========================================
  // VIEW 2: Folders / Albums Grid (Screenshot 1)
  // ==========================================
  if (selectedCategory === 'folders' || selectedCategory === 'albums') {
    return (
      <div className="w-full h-full flex flex-col bg-[#07080b] text-white pt-10 px-4 pb-28 select-none overflow-y-auto font-sans relative">
        {/* Back to Library Pill Button */}
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className="poweramp-pill-btn flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white"
          >
            <ArrowUp className="w-4 h-4" />
            <span>Library</span>
          </button>
        </div>

        {/* Title & Icon Header */}
        <div className="flex items-center gap-3 my-2 px-1">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-md">
            <Folder className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">Folders</h2>
        </div>

        {/* Poweramp Action Row (Screenshot 1) */}
        <div className="flex items-center gap-2 my-3 px-1">
          <button
            onClick={() => {
              if (library.length > 0) {
                const rand = library[Math.floor(Math.random() * library.length)]
                onSelectTrack(rand)
              }
            }}
            className="poweramp-pill-btn p-2.5 text-white"
            title="Shuffle"
          >
            <Shuffle className="w-5 h-5" />
          </button>

          <button
            onClick={() => {
              if (library.length > 0) onSelectTrack(library[0])
            }}
            className="poweramp-pill-btn p-2.5 text-white"
            title="Play All"
          >
            <Play className="w-5 h-5 fill-white" />
          </button>

          <button
            onClick={() => setSelectedCategory('all')}
            className="poweramp-pill-btn p-2.5 text-white"
            title="Search"
          >
            <Search className="w-5 h-5" />
          </button>

          <button className="poweramp-pill-btn px-4 py-2 text-xs font-bold text-white">
            Select
          </button>

          <button
            onClick={onOpenAcquire}
            className="poweramp-pill-btn flex items-center gap-1 px-3 py-2 text-xs font-bold text-cyan-400 bg-cyan-500/10 border-cyan-400/40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>

          <div className="flex-1" />

          <button
            onClick={onOpenAcquire}
            className="poweramp-pill-btn p-2.5 text-white"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>

        {/* 2-Column Album Artwork Grid (Screenshot 1) */}
        <div className="grid grid-cols-2 gap-3.5 mt-2">
          {albums.map((alb, i) => (
            <div
              key={i}
              onClick={() => {
                if (alb.tracks[0]) onSelectTrack(alb.tracks[0])
              }}
              className="flex flex-col cursor-pointer group"
            >
              <div className="aspect-square w-full rounded-3xl overflow-hidden bg-zinc-900 shadow-xl border border-white/10 relative">
                {alb.cover ? (
                  <img
                    src={alb.cover}
                    alt={alb.album}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                ) : (
                  <div className="w-full h-full bg-zinc-900 flex flex-col items-center justify-center text-zinc-600 gap-1">
                    <Disc className="w-12 h-12 text-zinc-700" />
                    <span className="text-[10px] font-mono font-bold text-zinc-500">SHEROFETCH</span>
                  </div>
                )}
              </div>

              {/* Album Title & Artist Text below */}
              <h3 className="text-sm font-bold text-white truncate mt-2 tracking-tight">
                {alb.year} - {alb.album}
              </h3>
              <p className="text-xs font-semibold text-zinc-400 truncate mt-0.5">
                {alb.artist}
              </p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ==========================================
  // VIEW 3: All Songs List View (Screenshot 3)
  // ==========================================
  return (
    <div className="w-full h-full flex flex-col bg-[#07080b] text-white pt-10 px-4 pb-28 select-none overflow-y-auto font-sans">
      {/* Top Search Pill (Screenshot 3) */}
      <div className="relative flex items-center mb-2">
        <div className="relative w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search library..."
            className="w-full h-11 bg-zinc-900/90 border border-white/10 rounded-full pl-12 pr-10 text-sm font-bold text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 shadow-inner"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Horizontal Category Chips (Screenshot 3) */}
      <div className="flex gap-2 overflow-x-auto py-2 no-scrollbar">
        {['All', 'Albums', 'Artists', 'Album Artists', 'Folders'].map((sub, i) => (
          <button
            key={sub}
            onClick={() => {
              if (sub === 'Folders' || sub === 'Albums') setSelectedCategory(sub.toLowerCase())
            }}
            className={`poweramp-pill-btn px-4 py-1.5 text-xs font-bold whitespace-nowrap ${
              i === 0 ? 'bg-zinc-800 text-white border-white/20' : 'text-zinc-400'
            }`}
          >
            {sub}
          </button>
        ))}
      </div>

      {/* Action Row: Shuffle, Play, Select, More (Screenshot 3) */}
      <div className="flex items-center gap-2 my-2">
        <button
          onClick={() => {
            if (filteredTracks.length > 0) {
              const rand = filteredTracks[Math.floor(Math.random() * filteredTracks.length)]
              onSelectTrack(rand)
            }
          }}
          className="poweramp-pill-btn p-2.5 text-white"
        >
          <Shuffle className="w-5 h-5" />
        </button>

        <button
          onClick={() => {
            if (filteredTracks.length > 0) onSelectTrack(filteredTracks[0])
          }}
          className="poweramp-pill-btn p-2.5 text-white"
        >
          <Play className="w-5 h-5 fill-white" />
        </button>

        <button className="poweramp-pill-btn px-4 py-2 text-xs font-bold text-white">
          Select
        </button>

        <button
          onClick={onOpenAcquire}
          className="poweramp-pill-btn flex items-center gap-1 px-3 py-2 text-xs font-bold text-cyan-400 bg-cyan-500/10 border-cyan-400/40"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Add</span>
        </button>

        <div className="flex-1" />

        <button
          onClick={onOpenAcquire}
          className="poweramp-pill-btn p-2.5 text-white"
        >
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>

      {/* Section Header: All Songs */}
      <div className="flex items-center gap-3 my-3">
        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">All Songs</span>
        <div className="flex-1 h-[1px] bg-white/10" />
      </div>

      {/* Songs List */}
      <div className="space-y-3">
        {filteredTracks.map((t, i) => {
          const isCurrent = currentTrack && (currentTrack.id === t.id || currentTrack.file_path === t.file_path)
          const isFlac = (t.file_path || '').toLowerCase().endsWith('.flac') || t.source_used?.includes('FLAC')

          return (
            <div
              key={t.id || i}
              onClick={() => onSelectTrack(t)}
              className="flex items-center gap-3.5 p-1 rounded-2xl cursor-pointer hover:bg-white/5 transition active:scale-[0.99]"
            >
              {/* Rounded-2xl Album Artwork Thumbnail (Screenshot 3) */}
              <div className="w-14 h-14 rounded-2xl overflow-hidden bg-zinc-800 border border-white/10 flex-shrink-0 shadow-md">
                {t.cover_path ? (
                  <img
                    src={t.cover_path}
                    alt="Cover"
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                ) : (
                  <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-600">
                    <Disc className="w-7 h-7" />
                  </div>
                )}
              </div>

              {/* Title & Metadata Details */}
              <div className="min-w-0 flex-1">
                <h4 className={`text-sm font-bold truncate tracking-tight ${isCurrent ? 'text-cyan-400' : 'text-white'}`}>
                  {t.track || t.title}
                </h4>
                <p className="text-xs text-zinc-400 truncate mt-0.5 font-medium">
                  {t.artist} - {t.album || 'Unknown Album'}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-mono text-zinc-500 font-semibold">
                  <span>{formatDuration(t.duration)}</span>
                  <span>|</span>
                  <span className="uppercase">{isFlac ? 'flac' : 'mp3'}</span>
                  <span>|</span>
                  <span>{isFlac ? '24 bit' : '320k'}</span>
                  <span>|</span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                    (t.source_used || '').includes('Soulseek')
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                      : 'bg-cyan-950 text-cyan-300 border border-cyan-500/40'
                  }`}>
                    {(t.source_used || '').includes('Soulseek') ? 'P2P FLAC' : 'Studio'}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
