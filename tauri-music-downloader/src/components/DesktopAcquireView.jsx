import React, { useState } from 'react'
import {
  Search,
  Download,
  Sparkles,
  Link2,
  Disc,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  FileAudio,
  Radio,
  ExternalLink,
  ChevronDown,
  Play,
  RotateCw,
  Zap
} from 'lucide-react'

export function DesktopAcquireView({
  onTrackInstalled,
  invokeFn,
  soulseekProfile,
  onOpenOnboarding
}) {
  const [query, setQuery] = useState('')
  const isUrl = query.trim().startsWith('http://') || query.trim().startsWith('https://')
  const [activeMode, setActiveMode] = useState('search') // 'search' | 'link' | 'batch'
  const [format, setFormat] = useState('flac') // 'flac' | 'mp3' | 'wav'
  const [acqMode, setAcqMode] = useState('waterfall') // 'waterfall' | 'strict_lossless' | 'instant_studio'
  const [isSearching, setIsSearching] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [candidates, setCandidates] = useState([])
  const [resolvedPlaylist, setResolvedPlaylist] = useState(null)
  const [downloadingId, setDownloadingId] = useState(null)
  const [activeWorkers, setActiveWorkers] = useState({}) // { [trackKey]: workerId }
  const [completedTracks, setCompletedTracks] = useState({}) // { [trackKey]: 'success' | 'skip' | 'error' }
  const [batchProgress, setBatchProgress] = useState({ completed: 0, total: 0 })
  const [isBatchDownloading, setIsBatchDownloading] = useState(false)
  const [statusAlert, setStatusAlert] = useState(null)
  const [activityLogs, setActivityLogs] = useState([
    { text: 'SheroFetch P2P Engine initialized. Ready to acquire lossless audio.', time: '00:00', type: 'info' }
  ])

  const addLog = (text, type = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setActivityLogs((prev) => [{ text, time, type }, ...prev.slice(0, 15)])
  }

  // 1. Search Query
  const handleSearch = async (e) => {
    if (e) e.preventDefault()
    const q = query.trim()
    if (!q) return

    // If looks like URL, automatically switch to link resolver
    if (q.startsWith('http://') || q.startsWith('https://')) {
      setActiveMode('link')
      handleResolveLink(q)
      return
    }

    setIsSearching(true)
    setStatusAlert(null)
    setCandidates([])
    addLog(`Searching Soulseek P2P & MusicBrainz for "${q}"...`, 'info')

    try {
      const res = await invokeFn('search_song_candidates', { query: q })
      const parsed = typeof res === 'string' ? JSON.parse(res) : res
      const list = parsed?.results || []
      setCandidates(list)

      if (list.length === 0) {
        setStatusAlert({ type: 'warn', text: 'No direct metadata matches found. Try refining artist or song title.' })
        addLog(`No candidate matches found for "${q}".`, 'warn')
      } else {
        addLog(`Discovered ${list.length} verified candidate recording(s).`, 'success')
      }
    } catch (err) {
      const msg = typeof err === 'string' ? err : err?.message || 'Search failed.'
      setStatusAlert({ type: 'error', text: msg })
      addLog(`Search error: ${msg}`, 'error')
    } finally {
      setIsSearching(false)
    }
  }

  // 2. Resolve URL
  const handleResolveLink = async (urlToResolve) => {
    const targetUrl = (urlToResolve || query).trim()
    if (!targetUrl) return

    setIsResolving(true)
    setStatusAlert(null)
    setResolvedPlaylist(null)
    addLog(`Resolving stream URL: ${targetUrl}...`, 'info')

    try {
      const res = await invokeFn('resolve_playlist_url', { url: targetUrl })
      const parsed = typeof res === 'string' ? JSON.parse(res) : res
      let tracks = []

      if (parsed?.tracks && Array.isArray(parsed.tracks)) {
        tracks = parsed.tracks
      } else if (parsed?.title) {
        tracks = [parsed]
      } else if (Array.isArray(parsed)) {
        tracks = parsed
      }

      setResolvedPlaylist({
        title: parsed?.playlist_title || 'Resolved Audio Stream',
        tracks
      })

      if (tracks.length > 0) {
        addLog(`Resolved ${tracks.length} track(s) from stream source. Ready to acquire.`, 'success')
      } else {
        setStatusAlert({ type: 'warn', text: 'Could not extract audio metadata from provided link.' })
        addLog('No audio streams resolved from URL.', 'warn')
      }
    } catch (err) {
      const msg = typeof err === 'string' ? err : err?.message || 'Link resolution failed.'
      setStatusAlert({ type: 'error', text: msg })
      addLog(`URL resolution error: ${msg}`, 'error')
    } finally {
      setIsResolving(false)
    }
  }

  // 3. Download Single Track via 4-Tier Waterfall
  const handleDownload = async (item, workerId = 0) => {
    const rawTarget = (item.query || item.title || item.track || '').trim()
    if (rawTarget.startsWith('http://') || rawTarget.startsWith('https://')) {
      addLog(`Detected stream playlist URL, redirecting to stream resolver...`, 'info')
      handleResolveLink(rawTarget)
      return
    }

    const wId = Number(workerId) || 0
    const itemKey = item.code || item.mbid || item.title || item.track
    if (!wId) setDownloadingId(itemKey)
    addLog(`[Worker ${wId || 1}] Starting acquisition for "${item.title || item.track}"...`, 'info')

    try {
      const res = await invokeFn('download_song', {
        query: item.query || `${item.artist} - ${item.title || item.track}`,
        preferred_format: format,
        preferredFormat: format,
        acq_mode: acqMode,
        acqMode: acqMode,
        code: item.code,
        exact_title: item.title || item.track,
        exactTitle: item.title || item.track,
        exact_artist: item.artist,
        exactArtist: item.artist,
        exact_url: item.direct_url,
        exactUrl: item.direct_url,
        expected_duration: item.duration_sec || item.duration,
        expectedDuration: item.duration_sec || item.duration,
        worker_id: wId > 0 ? wId : undefined,
        workerId: wId > 0 ? wId : undefined,
        recording: item
      })

      if (res) {
        const tierIcon = res.tier === 'green' ? '🟢 P2P FLAC' : res.tier === 'yellow' ? '🟡 Studio Master' : '🔵 HQ Audio'
        addLog(`[Worker ${wId || 1}] Installed "${res.track}" [${tierIcon}] to Library Vault!`, 'success')
        setStatusAlert({
          type: 'success',
          text: `Installed "${res.track}" (${tierIcon}) into your Lossless Vault!`
        })
        if (onTrackInstalled) onTrackInstalled(res)
        return res
      }
    } catch (err) {
      const msg = typeof err === 'string' ? err : err?.message || 'Acquisition failed.'
      setStatusAlert({ type: 'error', text: msg })
      addLog(`[Worker ${wId || 1}] Acquisition failed: ${msg}`, 'error')
      throw err
    } finally {
      if (!wId) setDownloadingId(null)
    }
  }

  // 4. Batch Download All (High-Throughput Multi-Worker Parallel Engine)
  const handleDownloadAll = async () => {
    if (!resolvedPlaylist?.tracks?.length || isBatchDownloading) return
    const tracks = resolvedPlaylist.tracks
    const maxConcurrency = 4
    setIsBatchDownloading(true)
    addLog(`Initiating High-Speed Multi-Worker Acquisition across 4 parallel Soulseek identities for ${tracks.length} tracks...`, 'info')

    let currentIndex = 0
    let completedCount = 0
    const totalCount = tracks.length
    setBatchProgress({ completed: 0, total: totalCount })

    const availableSlots = [1, 2, 3, 4]

    const runWorker = async () => {
      while (currentIndex < tracks.length) {
        const itemIdx = currentIndex++
        const item = tracks[itemIdx]
        const slot = availableSlots.shift() || 1
        const itemKey = item.code || item.mbid || item.title || item.track

        setActiveWorkers(prev => ({ ...prev, [itemKey]: slot }))

        try {
          await handleDownload(item, slot)
          setCompletedTracks(prev => ({ ...prev, [itemKey]: 'success' }))
        } catch (e) {
          setCompletedTracks(prev => ({ ...prev, [itemKey]: 'error' }))
        } finally {
          availableSlots.push(slot)
          setActiveWorkers(prev => {
            const next = { ...prev }
            delete next[itemKey]
            return next
          })
          completedCount++
          setBatchProgress({ completed: completedCount, total: totalCount })
        }
      }
    }

    const workerCount = Math.min(maxConcurrency, tracks.length)
    const workerPromises = Array.from({ length: workerCount }, () => runWorker())
    await Promise.all(workerPromises)

    setIsBatchDownloading(false)
    addLog(`Multi-Worker parallel acquisition completed for all ${tracks.length} tracks!`, 'success')
  }

  return (
    <div className="w-full h-full flex flex-col bg-[#07080E] text-zinc-100 overflow-y-auto select-none p-3.5 md:p-6 pb-28 md:pb-6 font-sans">
      {/* 1. Header Title & Mode Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 pb-4 sm:pb-6 border-b border-white/5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">Acquisition Studio</h1>
            <span className="text-[10px] sm:text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              P2P & Studio
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-zinc-400 mt-1 font-medium leading-relaxed">
            Acquire bit-perfect 1411kbps+ FLAC directly from Soulseek P2P with automated studio failover.
          </p>
        </div>

        {/* Quality & Tier Controls */}
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          {/* Audio Format Selector */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/5 text-[11px] sm:text-xs font-bold flex-1 sm:flex-initial justify-center">
            <button
              onClick={() => setFormat('flac')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg transition ${
                format === 'flac' ? 'bg-cyan-500 text-black shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              FLAC
            </button>
            <button
              onClick={() => setFormat('wav')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg transition ${
                format === 'wav' ? 'bg-cyan-500 text-black shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              WAV
            </button>
            <button
              onClick={() => setFormat('mp3')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg transition ${
                format === 'mp3' ? 'bg-cyan-500 text-black shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              320K MP3
            </button>
          </div>

          {/* Acquisition Strategy Selector */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/5 text-[11px] sm:text-xs font-bold flex-1 sm:flex-initial justify-center">
            <button
              onClick={() => setAcqMode('waterfall')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg transition flex items-center gap-1.5 ${
                acqMode === 'waterfall' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
              title="Waterfall: P2P FLAC -> Studio Master -> 320k Failover"
            >
              <Sparkles className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
              <span>Waterfall</span>
            </button>
            <button
              onClick={() => setAcqMode('strict_lossless')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg transition ${
                acqMode === 'strict_lossless' ? 'bg-emerald-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
              title="Only accepts genuine P2P Lossless FLAC"
            >
              Strict P2P
            </button>
          </div>
        </div>
      </div>

      {/* Soulseek Live Connection Status Banner */}
      <div className={`mt-3.5 sm:mt-5 p-3 sm:p-3.5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 sm:gap-3 text-xs transition-all ${
        soulseekProfile?.logged_in
          ? 'bg-emerald-500/[0.08] border-emerald-500/30 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.12)]'
          : 'bg-rose-500/[0.08] border-rose-500/30 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.12)]'
      }`}>
        <div className="flex items-center gap-2.5 min-w-0 w-full sm:w-auto">
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
            soulseekProfile?.logged_in ? 'bg-emerald-400 animate-pulse shadow-[0_0_10px_#34d399]' : 'bg-rose-500 shadow-[0_0_10px_#f43f5e]'
          }`} />
          <span className="font-mono font-bold text-[11px] sm:text-xs truncate">
            {soulseekProfile?.logged_in
              ? `SOULSEEK: CONNECTED (@${soulseekProfile.username})`
              : 'SOULSEEK: OFFLINE (Studio Fallback Active)'}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenOnboarding}
          className={`w-full sm:w-auto px-3.5 py-1.5 rounded-xl font-black font-mono text-[10px] sm:text-[11px] uppercase tracking-wider flex-shrink-0 transition border shadow-sm text-center ${
            soulseekProfile?.logged_in
              ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-500 hover:bg-rose-400 border-rose-400 text-white shadow-[0_0_12px_rgba(244,63,94,0.35)]'
          }`}
        >
          {soulseekProfile?.logged_in ? 'Switch Account' : 'Connect Soulseek'}
        </button>
      </div>

      {/* 2. Hero Search Bar */}
      <div className="mt-3 sm:mt-4">
        <form onSubmit={handleSearch} className="relative flex items-center">
          <Search className="absolute left-3.5 sm:left-4 w-4 sm:w-5 h-4 sm:h-5 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Song, artist, or Spotify/YouTube link..."
            className="w-full h-12 sm:h-14 pl-10 sm:pl-12 pr-28 sm:pr-36 rounded-2xl bg-white/[0.03] focus:bg-black/90 border border-white/10 focus:border-cyan-500/50 text-xs sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 sm:focus:ring-4 focus:ring-cyan-500/20 shadow-2xl transition-all font-medium"
          />
          <button
            type="submit"
            disabled={isSearching || isResolving}
            className={`absolute right-1.5 sm:right-2.5 h-9 sm:h-10 px-3 sm:px-5 rounded-xl font-black text-xs flex items-center gap-1.5 sm:gap-2 shadow-lg transition-all disabled:opacity-50 ${
              isUrl
                ? 'bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 hover:to-teal-200 text-black shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                : 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-[0_0_15px_rgba(0,229,255,0.4)]'
            }`}
          >
            {isSearching || isResolving ? (
              <RotateCw className="w-3.5 sm:w-4 h-3.5 sm:h-4 animate-spin" />
            ) : isUrl ? (
              <Link2 className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
            ) : (
              <Download className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
            )}
            <span>
              {isSearching || isResolving
                ? '...'
                : isUrl
                ? 'Resolve'
                : 'Acquire'}
            </span>
          </button>
        </form>
      </div>

      {/* Alert Message Banner */}
      {statusAlert && (
        <div
          className={`mt-4 p-3.5 rounded-2xl flex items-center gap-3 text-xs font-medium border ${
            statusAlert.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : statusAlert.type === 'warn'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {statusAlert.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{statusAlert.text}</span>
        </div>
      )}

      {/* 3. Stream / Playlist Resolved Section */}
      {resolvedPlaylist && (
        <div className="mt-4 sm:mt-6 p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-white/[0.02] border border-cyan-500/30 flex flex-col gap-3.5 sm:gap-4 shadow-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                STREAM PLAYLIST RESOLVER
              </span>
              <h3 className="text-sm sm:text-base font-bold text-white mt-0.5 truncate">
                {resolvedPlaylist.title} ({resolvedPlaylist.tracks.length} Tracks)
              </h3>
            </div>
            <button
              onClick={handleDownloadAll}
              disabled={Boolean(downloadingId) || isBatchDownloading}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold transition flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,229,255,0.4)] disabled:opacity-50"
            >
              {isBatchDownloading ? (
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>{isBatchDownloading ? 'Downloading...' : `Download All (${resolvedPlaylist.tracks.length})`}</span>
            </button>
          </div>

          {/* Multi-Worker Parallel Progress Bar */}
          {isBatchDownloading && (
            <div className="flex flex-col gap-2 w-full bg-cyan-950/30 border border-cyan-500/20 p-3 sm:p-3.5 rounded-2xl animate-fadeIn">
              <div className="flex items-center justify-between text-[11px] sm:text-xs font-mono text-cyan-300 font-bold">
                <span className="flex items-center gap-1.5 truncate">
                  <Zap className="w-3.5 h-3.5 text-cyan-400 animate-pulse flex-shrink-0" />
                  <span className="truncate">Multi-Worker Active</span>
                </span>
                <span>
                  {batchProgress.completed} / {batchProgress.total} ({Math.round((batchProgress.completed / (batchProgress.total || 1)) * 100)}%)
                </span>
              </div>
              <div className="w-full bg-black/40 rounded-full h-2 overflow-hidden border border-white/10 p-0.5">
                <div
                  className="bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${(batchProgress.completed / (batchProgress.total || 1)) * 100}%` }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
            {resolvedPlaylist.tracks.map((t, i) => {
              const itemKey = t.code || t.mbid || t.title || t.track
              const workerSlot = activeWorkers[itemKey]
              const status = completedTracks[itemKey]

              return (
                <div
                  key={itemKey || i}
                  className={`p-2.5 rounded-xl border transition flex items-center justify-between gap-2.5 ${
                    workerSlot
                      ? 'bg-cyan-950/20 border-cyan-500/40 shadow-[0_0_10px_rgba(0,229,255,0.15)]'
                      : status === 'success'
                      ? 'bg-emerald-950/20 border-emerald-500/30'
                      : 'bg-white/[0.02] border-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xs font-mono text-zinc-500 w-5 text-center flex-shrink-0">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{t.title || t.track}</p>
                      <p className="text-[10px] text-zinc-400 truncate">{t.artist}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {workerSlot ? (
                      <span className="px-2 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-mono font-bold flex items-center gap-1 animate-pulse">
                        <Zap className="w-3 h-3 text-cyan-400" />
                        W{workerSlot}
                      </span>
                    ) : status === 'success' ? (
                      <span className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Done
                      </span>
                    ) : status === 'error' ? (
                      <span className="px-2 py-1 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-mono font-bold flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Retry
                      </span>
                    ) : (
                      <button
                        onClick={() => handleDownload(t)}
                        disabled={Boolean(downloadingId) || isBatchDownloading}
                        className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-cyan-500 hover:text-black text-xs font-bold text-zinc-300 transition flex items-center gap-1 flex-shrink-0 disabled:opacity-40"
                      >
                        <Download className="w-3 h-3" />
                        <span>Get</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Stream & Playlist URL Resolver Card (When query is a URL) */}
      {isUrl && !isResolving && !resolvedPlaylist && (
        <div className="mt-4 sm:mt-6 p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-gradient-to-r from-emerald-950/40 via-zinc-900/60 to-black border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-5 shadow-[0_10px_35px_rgba(0,0,0,0.8)] animate-slideUp">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
              <Link2 className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-black">
                  STREAM URL DETECTED
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
                  SPOTIFY / YT / APPLE
                </span>
              </div>
              <h4 className="text-xs sm:text-sm font-black text-white mt-1 truncate max-w-md font-mono">
                {query.trim()}
              </h4>
              <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5 max-w-lg">
                Extract and index audio metadata directly from this link into your Lossless Vault.
              </p>
            </div>
          </div>
          <button
            onClick={() => handleResolveLink(query.trim())}
            disabled={isResolving}
            className="w-full sm:w-auto px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(16,185,129,0.4)] transition flex-shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            <span>Resolve Stream Link</span>
          </button>
        </div>
      )}

      {/* Direct P2P Acquisition Card (When query is a song name and 0 catalog candidates found) */}
      {!isUrl && query.trim() && candidates.length === 0 && !isSearching && !isResolving && (
        <div className="mt-4 sm:mt-6 p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-gradient-to-r from-cyan-950/40 via-zinc-900/60 to-black border border-cyan-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-5 shadow-[0_10px_35px_rgba(0,0,0,0.8)] animate-slideUp">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 flex-shrink-0 shadow-[0_0_20px_rgba(0,229,255,0.2)]">
              <Sparkles className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-black">
                  DIRECT P2P & WATERFALL
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  SOULSEEK READY
                </span>
              </div>
              <h4 className="text-sm sm:text-base font-black text-white mt-1 truncate">
                Acquire "{query.trim()}" Directly
              </h4>
              <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5 max-w-lg">
                Query Soulseek P2P peers and the 4-Tier Waterfall pipeline directly for this track.
              </p>
            </div>
          </div>
          <button
            onClick={() => handleDownload({
              query: query.trim(),
              title: query.trim(),
              artist: 'Direct Acquisition',
              track: query.trim(),
              code: `#DIRECT-${Date.now()}`
            })}
            disabled={Boolean(downloadingId)}
            className="w-full sm:w-auto px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(0,229,255,0.4)] transition flex-shrink-0 disabled:opacity-50"
          >
            {downloadingId ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin text-black" />
                <span>Acquiring...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Acquire Now</span>
              </>
            )}
          </button>
        </div>
      )}
      {candidates.length > 0 && (
        <div className="mt-6 sm:mt-8">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-2">
              <Disc className="w-4 h-4 text-cyan-400" />
              <span>Verified Candidate Recordings ({candidates.length})</span>
            </h3>
            <span className="text-[10px] sm:text-xs text-zinc-500 font-mono">Ranked by Matching</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {candidates.map((cand, idx) => {
              const isBusy = downloadingId === (cand.code || cand.mbid || cand.title)

              return (
                <div
                  key={cand.id || cand.code || idx}
                  className="p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 hover:border-cyan-500/30 transition-all flex flex-col justify-between gap-3 group shadow-lg"
                >
                  <div className="flex items-center gap-3">
                    {/* Cover Art */}
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-zinc-900 border border-white/10 overflow-hidden flex-shrink-0 shadow-md">
                      {cand.cover_url ? (
                        <img
                          src={cand.cover_url}
                          alt="Cover"
                          className="w-full h-full object-cover"
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600">
                          <Disc className="w-7 h-7 sm:w-8 sm:h-8" />
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] sm:text-[10px] font-mono font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
                          {cand.code || `#SF-${idx + 1}`}
                        </span>
                        <span className="text-[9px] sm:text-[10px] text-zinc-500 font-mono truncate">
                          {Math.round((cand.confidence || 0.9) * 100)}% Match
                        </span>
                      </div>
                      <h4 className="text-xs sm:text-sm font-bold text-white truncate mt-1 group-hover:text-cyan-400 transition-colors">
                        {cand.title}
                      </h4>
                      <p className="text-[11px] text-zinc-400 truncate mt-0.5 font-medium">
                        {cand.artist}
                      </p>
                    </div>
                  </div>

                  {/* Audio Specs & Download Button */}
                  <div className="pt-2.5 sm:pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] font-mono text-zinc-400">
                      <span>{Math.floor((cand.duration_sec || 180) / 60)}:{(Math.floor(cand.duration_sec || 180) % 60).toString().padStart(2, '0')}</span>
                      <span>•</span>
                      <span className="text-emerald-400 font-bold">~{cand.estimated_flac_mb || 32} MB</span>
                    </div>

                    <button
                      onClick={() => handleDownload(cand)}
                      disabled={isBusy}
                      className="px-3 sm:px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-black transition flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,229,255,0.3)] disabled:opacity-50"
                    >
                      {isBusy ? (
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>{isBusy ? 'Acquiring...' : 'Acquire'}</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 5. Real-Time Waterfall Activity Terminal HUD */}
      <div className="mt-8 p-5 rounded-3xl bg-black/60 border border-white/5 flex flex-col gap-2.5 font-mono shadow-xl">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>P2P Waterfall Activity HUD</span>
          </span>
          <span className="text-[10px] text-zinc-500">Live Socket Feed</span>
        </div>

        <div className="space-y-1.5 text-xs max-h-36 overflow-y-auto">
          {activityLogs.map((log, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="text-[10px] text-zinc-600 flex-shrink-0">{log.time}</span>
              <span
                className={`truncate ${
                  log.type === 'success'
                    ? 'text-emerald-400 font-bold'
                    : log.type === 'warn'
                    ? 'text-amber-400'
                    : log.type === 'error'
                    ? 'text-rose-400 font-bold'
                    : 'text-zinc-400'
                }`}
              >
                {log.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
