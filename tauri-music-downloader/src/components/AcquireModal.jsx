import React, { useState } from 'react'
import {
  Search,
  Link2,
  FileSpreadsheet,
  Download,
  X,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Music2,
  Disc,
  ArrowRight
} from 'lucide-react'

export function AcquireModal({ isOpen, onClose, onTrackInstalled, invokeFn }) {
  const [activeTab, setActiveTab] = useState('search') // 'search' | 'link' | 'csv'
  const [format, setFormat] = useState('flac') // 'flac' | '320k' | 'wav' | 'm4a'

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [candidates, setCandidates] = useState([])
  const [downloadingMbid, setDownloadingMbid] = useState(null)
  const [statusMsg, setStatusMsg] = useState(null)

  // Link Resolver state
  const [linkInput, setLinkInput] = useState('')
  const [isResolvingLink, setIsResolvingLink] = useState(false)
  const [resolvedSongs, setResolvedSongs] = useState([])

  // CSV state
  const [csvText, setCsvText] = useState('')
  const [parsedCsvRows, setParsedCsvRows] = useState([])
  const [isProcessingCsv, setIsProcessingCsv] = useState(false)

  if (!isOpen) return null

  // 1. Search Songs
  const handleSearch = async (e) => {
    e?.preventDefault()
    if (!searchQuery.trim()) return
    setIsSearching(true)
    setStatusMsg(null)
    setCandidates([])

    try {
      const res = await invokeFn('search_song_candidates', { query: searchQuery.trim() })
      const parsed = typeof res === 'string' ? JSON.parse(res) : res
      const list = parsed?.results || []
      setCandidates(list)
      if (list.length === 0) {
        setStatusMsg({ type: 'warn', text: 'No matching recordings found. Try a different title/artist.' })
      }
    } catch (err) {
      console.error('Search error:', err)
      setStatusMsg({ type: 'error', text: err.message || 'Search failed.' })
    } finally {
      setIsSearching(false)
    }
  }

  // 2. Download Candidate
  const handleDownloadCandidate = async (cand) => {
    setDownloadingMbid(cand.mbid || cand.title)
    setStatusMsg({ type: 'info', text: `Acquiring "${cand.title}" in verified ${format.toUpperCase()}...` })

    try {
      const installed = await invokeFn('download_song', {
        query: `${cand.artist} - ${cand.title}`,
        preferred_format: format,
        recording: cand
      })
      setStatusMsg({ type: 'success', text: `Successfully installed "${installed.track}" to Library!` })
      if (onTrackInstalled) onTrackInstalled(installed)
    } catch (err) {
      console.error('Download error:', err)
      setStatusMsg({ type: 'error', text: err.message || 'Acquisition failed.' })
    } finally {
      setDownloadingMbid(null)
    }
  }

  // 3. Resolve Link
  const handleResolveLink = async (e) => {
    e?.preventDefault()
    if (!linkInput.trim()) return
    setIsResolvingLink(true)
    setStatusMsg(null)
    setResolvedSongs([])

    try {
      const url = linkInput.trim()
      let songs = []
      if (url.includes('playlist') || url.includes('/sets/') || url.includes('/album/')) {
        const res = await invokeFn('resolve_playlist_url', { url })
        songs = res?.tracks || res?.songs || []
      } else {
        const res = await invokeFn('resolve_song_url', { url })
        if (res && res.title) songs = [res]
      }

      setResolvedSongs(songs)
      if (songs.length === 0) {
        setStatusMsg({ type: 'warn', text: 'Could not resolve audio streams from provided URL.' })
      }
    } catch (err) {
      console.error('Link error:', err)
      setStatusMsg({ type: 'error', text: err.message || 'Link resolution failed.' })
    } finally {
      setIsResolvingLink(false)
    }
  }

  // 4. Parse CSV
  const handleParseCsv = () => {
    if (!csvText.trim()) return
    const lines = csvText.trim().split(/\r?\n/)
    if (lines.length === 0) return

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''))
    const titleIdx = header.findIndex((h) => h.includes('track') || h.includes('title') || h.includes('song') || h.includes('name'))
    const artistIdx = header.findIndex((h) => h.includes('artist') || h.includes('singer') || h.includes('by'))
    const albumIdx = header.findIndex((h) => h.includes('album'))

    const rows = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
      if (cols.length < 1 || !cols[0]) continue
      rows.push({
        title: titleIdx !== -1 ? cols[titleIdx] : cols[0],
        artist: artistIdx !== -1 ? cols[artistIdx] : (cols[1] || 'Unknown Artist'),
        album: albumIdx !== -1 ? cols[albumIdx] : 'Unknown Album'
      })
    }

    setParsedCsvRows(rows)
    setStatusMsg({ type: 'info', text: `Parsed ${rows.length} tracks from CSV. Ready for batch acquisition.` })
  }

  // 5. Batch Download CSV
  const handleBatchDownloadCsv = async () => {
    if (parsedCsvRows.length === 0) return
    setIsProcessingCsv(true)
    let installedCount = 0

    for (let i = 0; i < parsedCsvRows.length; i++) {
      const item = parsedCsvRows[i]
      setStatusMsg({ type: 'info', text: `Acquiring [${i + 1}/${parsedCsvRows.length}]: "${item.title}"...` })
      try {
        const res = await invokeFn('download_song', {
          query: `${item.artist} - ${item.title}`,
          preferred_format: format
        })
        if (res) {
          installedCount++
          if (onTrackInstalled) onTrackInstalled(res)
        }
      } catch (e) {
        console.warn('Batch item failed:', item.title, e)
      }
    }

    setIsProcessingCsv(false)
    setStatusMsg({ type: 'success', text: `Batch complete! Successfully installed ${installedCount} songs.` })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md transition-all duration-300 select-none">
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col bg-[#0A0D14] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-6">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-black/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-[0_0_12px_rgba(0,229,255,0.3)]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">Acquire Songs</h2>
              <p className="text-[11px] text-zinc-400">SheroFetch Audiophile Ingestion Suite</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Format Selector Pills */}
        <div className="px-5 pt-3 pb-2 flex items-center justify-between gap-2 border-b border-white/5 bg-zinc-950/40">
          <span className="text-[11px] font-bold text-zinc-400 tracking-wider">TARGET FORMAT:</span>
          <div className="flex gap-1.5">
            {[
              { id: 'flac', label: 'FLAC (Lossless)' },
              { id: '320k', label: 'MP3 (320k)' },
              { id: 'wav', label: 'WAV' },
              { id: 'm4a', label: 'M4A' }
            ].map((fmt) => (
              <button
                key={fmt.id}
                onClick={() => setFormat(fmt.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                  format === fmt.id
                    ? 'bg-cyan-500 text-black shadow-[0_0_8px_rgba(0,229,255,0.4)]'
                    : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                }`}
              >
                {fmt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 bg-black/20">
          <button
            onClick={() => setActiveTab('search')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold border-b-2 transition ${
              activeTab === 'search'
                ? 'border-cyan-400 text-cyan-400 bg-cyan-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Search</span>
          </button>

          <button
            onClick={() => setActiveTab('link')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold border-b-2 transition ${
              activeTab === 'link'
                ? 'border-cyan-400 text-cyan-400 bg-cyan-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Link2 className="w-4 h-4" />
            <span>Song/Playlist Link</span>
          </button>

          <button
            onClick={() => setActiveTab('csv')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold border-b-2 transition ${
              activeTab === 'csv'
                ? 'border-cyan-400 text-cyan-400 bg-cyan-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>CSV Batch</span>
          </button>
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Notification Banner */}
          {statusMsg && (
            <div
              className={`flex items-center gap-2.5 p-3 rounded-xl text-xs font-medium ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-300'
                  : statusMsg.type === 'error'
                  ? 'bg-rose-950/40 border border-rose-500/30 text-rose-300'
                  : statusMsg.type === 'warn'
                  ? 'bg-amber-950/40 border border-amber-500/30 text-amber-300'
                  : 'bg-cyan-950/40 border border-cyan-500/30 text-cyan-300'
              }`}
            >
              {statusMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              <span className="flex-1">{statusMsg.text}</span>
            </div>
          )}

          {/* TAB 1: Search & Download */}
          {activeTab === 'search' && (
            <div className="space-y-4">
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Enter track or artist (e.g. Hotel California, Arijit Singh)..."
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSearching || !searchQuery.trim()}
                  className="px-4 py-2.5 rounded-xl bg-cyan-500 text-black font-bold text-xs flex items-center gap-1.5 hover:bg-cyan-400 disabled:opacity-50 transition"
                >
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Find</span>}
                </button>
              </form>

              {/* Candidates List */}
              <div className="space-y-2 max-h-[350px] overflow-y-auto">
                {candidates.map((c, i) => {
                  const isDownloading = downloadingMbid === (c.mbid || c.title)
                  return (
                    <div
                      key={c.mbid || i}
                      className="flex items-center justify-between p-3 rounded-2xl bg-zinc-900/50 hover:bg-zinc-800/60 border border-white/5 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {c.cover ? (
                          <img
                            src={c.cover}
                            alt="Cover"
                            className="w-12 h-12 rounded-xl object-cover border border-white/10"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-500">
                            <Disc className="w-6 h-6" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-bold text-white truncate">{c.title}</h4>
                          <p className="text-xs text-zinc-400 truncate">{c.artist}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-500">
                            <span>{c.album || 'Single'}</span>
                            <span>•</span>
                            <span>{Math.floor(c.duration / 60)}:{(c.duration % 60).toString().padStart(2, '0')}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDownloadCandidate(c)}
                        disabled={isDownloading}
                        className="ml-3 p-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-black border border-cyan-500/30 transition disabled:opacity-50"
                        title="Acquire this track"
                      >
                        {isDownloading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* TAB 2: Universal Link Resolver */}
          {activeTab === 'link' && (
            <div className="space-y-4">
              <form onSubmit={handleResolveLink} className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    placeholder="Paste Spotify, YouTube, YT Music or Apple Music URL..."
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isResolvingLink || !linkInput.trim()}
                  className="px-4 py-2.5 rounded-xl bg-cyan-500 text-black font-bold text-xs flex items-center gap-1.5 hover:bg-cyan-400 disabled:opacity-50 transition"
                >
                  {isResolvingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Resolve</span>}
                </button>
              </form>

              {resolvedSongs.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs font-semibold text-zinc-400">
                    <span>Resolved {resolvedSongs.length} track(s)</span>
                  </div>
                  {resolvedSongs.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-white/5"
                    >
                      <div className="min-w-0 flex-1">
                        <h5 className="text-sm font-bold text-white truncate">{s.title || s.track}</h5>
                        <p className="text-xs text-zinc-400 truncate">{s.artist}</p>
                      </div>
                      <button
                        onClick={() => handleDownloadCandidate(s)}
                        className="ml-3 p-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-black border border-cyan-500/30 transition"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CSV Batch Ingestion */}
          {activeTab === 'csv' && (
            <div className="space-y-4">
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="Paste CSV rows here:&#10;Track, Artist, Album&#10;Hotel California, Eagles, Hotel California&#10;Stayin' Alive, Bee Gees, Saturday Night Fever"
                rows={4}
                className="w-full bg-zinc-900 border border-white/10 rounded-xl p-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500 font-mono"
              />

              <div className="flex gap-2">
                <button
                  onClick={handleParseCsv}
                  disabled={!csvText.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition disabled:opacity-50"
                >
                  Parse CSV
                </button>
                {parsedCsvRows.length > 0 && (
                  <button
                    onClick={handleBatchDownloadCsv}
                    disabled={isProcessingCsv}
                    className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                  >
                    {isProcessingCsv ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    <span>Acquire All ({parsedCsvRows.length})</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
