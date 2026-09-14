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
  ArrowRight,
  FolderOpen,
  Copy,
  Check,
  Table,
  Zap,
  RefreshCw
} from 'lucide-react'

export function AcquireModal({ isOpen = true, onClose, onTrackInstalled, invokeFn, inline = false }) {
  const [activeTab, setActiveTab] = useState('search') // 'search' | 'link' | 'csv' | 'report'
  const [format, setFormat] = useState('flac') // 'flac' | '320k' | 'wav' | 'm4a'

  // Acquisition Mode: 'hybrid' | 'strict_lossless' | 'instant_studio'
  const [acqMode, setAcqMode] = useState(() => {
    try {
      return localStorage.getItem('sherofetch_acq_mode') || 'hybrid'
    } catch {
      return 'hybrid'
    }
  })

  const handleAcqModeChange = (mode) => {
    setAcqMode(mode)
    try {
      localStorage.setItem('sherofetch_acq_mode', mode)
    } catch {}
  }

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
  const [resolvedPlaylistTitle, setResolvedPlaylistTitle] = useState('')
  const [isDownloadingAll, setIsDownloadingAll] = useState(false)

  // CSV state
  const [csvText, setCsvText] = useState('')
  const [parsedCsvRows, setParsedCsvRows] = useState([])
  const [isProcessingCsv, setIsProcessingCsv] = useState(false)

  // Waterfall Download Report (What, Where, How)
  const [downloadReport, setDownloadReport] = useState([])
  const [copiedReport, setCopiedReport] = useState(false)
  const [isUpgrading, setIsUpgrading] = useState(false)
  const [upgradingCodes, setUpgradingCodes] = useState([])

  if (!isOpen) return null

  // Helper: record a download in report table
  const recordReportItem = (res, cand = {}) => {
    const isSkipped = !!res.skipped
    const tier = res.tier || (isSkipped ? 'skipped' : (res.source_used?.includes('Soulseek') ? 'green' : 'yellow'))
    const songCode = res.code || cand.code || cand.mbid || `#SF-${Math.floor(Math.random() * 899999 + 100000)}`
    const songTitle = res.track || cand.title || cand.track || 'Unknown Title'
    const songArtist = res.artist || cand.artist || 'Unknown Artist'
    const item = {
      code: songCode,
      title: songTitle,
      artist: songArtist,
      query: cand.query || (songArtist && songArtist !== 'Unknown Artist' ? `${songArtist} - ${songTitle}` : songTitle),
      playlist_name: cand.playlist_name || cand.targetFolder || resolvedPlaylistTitle || '',
      exact_url: cand.direct_url || cand.url || res.exact_url || '',
      tier: tier,
      tier_label: res.tier_label || (tier === 'green' ? '🟢 Lossless P2P FLAC' : tier === 'yellow' ? '🟡 Studio Transcoded FLAC' : tier === 'red' ? '🔴 HQ 320k Audio' : tier === 'white' ? '⚪ Standard Fallback' : '⏭️ Duplicate Skipped'),
      how: res.how || res.source_used || 'Studio Audio',
      file_path: res.file_path || '',
      folder_path: res.folder_path || '',
      size_mb: res.file_size_mb || 0,
      duration: res.duration || cand.duration || 0,
      skipped: isSkipped,
      upgraded: !!res.upgraded,
      status: res.upgraded ? 'Upgraded to FLAC' : (isSkipped ? 'Preserved (Best Available)' : 'Downloaded')
    }
    setDownloadReport(prev => [item, ...prev.filter(x => x.code !== item.code && x.file_path !== item.file_path)])
    return item
  }

  // Refine / Upgrade handlers
  const upgradeTrack = async (row) => {
    const songTitle = row.title || 'Track'
    const songArtist = (row.artist && row.artist !== 'Unknown Artist') ? row.artist : ''
    const query = row.query || (songArtist ? `${songArtist} - ${songTitle}` : songTitle)
    const targetFolder = row.playlist_name || (row.folder_path ? row.folder_path.split('/').pop() : null)

    const res = await invokeFn('download_song', {
      query,
      target_dir: null,
      targetDir: null,
      playlist_name: targetFolder,
      playlistName: targetFolder,
      preferred_format: 'flac',
      preferredFormat: 'flac',
      acq_mode: 'strict_lossless',
      acqMode: 'strict_lossless',
      upgrade_mode: true,
      upgradeMode: true,
      code: row.code,
      exact_title: songTitle,
      exactTitle: songTitle,
      exact_artist: songArtist,
      exactArtist: songArtist,
      exact_url: row.exact_url,
      exactUrl: row.exact_url,
      expected_duration: row.duration,
      expectedDuration: row.duration
    })

    if (res) {
      const isSkipped = !!res.skipped
      const newTier = res.tier || (isSkipped ? row.tier : (res.source_used?.includes('Soulseek') ? 'green' : 'yellow'))
      const updatedItem = {
        ...row,
        tier: newTier,
        tier_label: res.tier_label || (newTier === 'green' ? '🟢 Lossless P2P FLAC' : newTier === 'yellow' ? '🟡 Studio Transcoded FLAC' : newTier === 'red' ? '🔴 HQ 320k Audio' : '⚪ Standard Fallback'),
        how: res.how || res.source_used || row.how,
        file_path: res.file_path || row.file_path,
        folder_path: res.folder_path || row.folder_path,
        size_mb: res.file_size_mb || row.size_mb,
        duration: res.duration || row.duration,
        upgraded: res.upgraded || false,
        skipped: isSkipped,
        status: res.upgraded ? 'Upgraded to FLAC' : (isSkipped ? 'Preserved (Best Available)' : 'Updated')
      }

      setDownloadReport(prev => prev.map(item => item.code === row.code ? updatedItem : item))
      if (onTrackInstalled) onTrackInstalled(res)
      return updatedItem
    }
    return null
  }

  const handleUpgradeSingle = async (row) => {
    if (isUpgrading || upgradingCodes.includes(row.code)) return
    setUpgradingCodes(prev => [...prev, row.code])
    setStatusMsg({
      type: 'info',
      text: `⚡ Refining [${row.code}] "${row.title}" (Waterfall upgrade to Green Dot FLAC)...`
    })

    try {
      const updated = await upgradeTrack(row)
      if (updated?.upgraded || updated?.tier === 'green') {
        setStatusMsg({
          type: 'success',
          text: `🎉 Successfully upgraded [${row.code}] "${row.title}" to 🟢 Green Dot FLAC!`
        })
      } else {
        setStatusMsg({
          type: 'info',
          text: `ℹ️ Preserved existing file for "${row.title}" (no higher tier found on P2P mesh).`
        })
      }
    } catch (err) {
      console.error(err)
      setStatusMsg({
        type: 'error',
        text: `Upgrade check failed: ${err?.message || err}`
      })
    } finally {
      setUpgradingCodes(prev => prev.filter(c => c !== row.code))
    }
  }

  const handleUpgradeAll = async () => {
    const candidatesToUpgrade = downloadReport.filter(r => r.tier !== 'green')
    if (candidatesToUpgrade.length === 0) {
      setStatusMsg({
        type: 'info',
        text: 'All tracks are already verified 🟢 Green Dot FLAC!'
      })
      return
    }

    setIsUpgrading(true)
    let upgradedCount = 0
    let preservedCount = 0

    for (let i = 0; i < candidatesToUpgrade.length; i++) {
      const row = candidatesToUpgrade[i]
      setUpgradingCodes([row.code])
      setStatusMsg({
        type: 'info',
        text: `[Refining ${i + 1}/${candidatesToUpgrade.length}] Searching Soulseek for [${row.code}] "${row.title}" (Replace only if higher tier FLAC)...`
      })

      try {
        const res = await upgradeTrack(row)
        if (res?.upgraded || res?.tier === 'green') {
          upgradedCount++
        } else {
          preservedCount++
        }
      } catch (err) {
        console.error(`Error refining ${row.title}:`, err)
        preservedCount++
      }
    }

    setUpgradingCodes([])
    setIsUpgrading(false)
    setStatusMsg({
      type: 'success',
      text: `✨ Refinement run complete! Upgraded: ${upgradedCount} tracks to 🟢 Green Dot FLAC, Preserved: ${preservedCount} existing.`
    })
  }

  // 1. Search Songs (Auto-detects link or keyword search)
  const handleSearch = async (e) => {
    e?.preventDefault()
    const q = searchQuery.trim()
    if (!q) return
    setIsSearching(true)
    setStatusMsg(null)
    setCandidates([])

    // If query is a URL, redirect to link resolver tab or resolve directly
    if (q.startsWith('http://') || q.startsWith('https://') || q.startsWith('spotify:') || q.includes('youtube.com') || q.includes('youtu.be')) {
      setLinkInput(q)
      setActiveTab('link')
      setIsSearching(false)
      // Automatically trigger resolve link
      setTimeout(() => {
        handleResolveLinkDirect(q)
      }, 50)
      return
    }

    try {
      const res = await invokeFn('search_song_candidates', { query: q })
      const parsed = typeof res === 'string' ? JSON.parse(res) : res
      const list = parsed?.results || []
      setCandidates(list)
      if (list.length === 0) {
        setStatusMsg({ type: 'warn', text: 'No matching recordings found. Try a different title/artist or paste direct link.' })
      }
    } catch (err) {
      console.error('Search error:', err)
      setStatusMsg({ type: 'error', text: err.message || 'Search failed.' })
    } finally {
      setIsSearching(false)
    }
  }

  // 2. Download Candidate via 4-Tier Waterfall
  const handleDownloadCandidate = async (cand) => {
    const songCode = cand.code || cand.mbid || `#SF-${Date.now()}`
    setDownloadingMbid(cand.mbid || cand.title)
    const modeLabel = acqMode === 'strict_lossless' ? 'Strict Lossless' : (acqMode === 'instant_studio' ? 'Instant 320k' : 'Waterfall (P2P -> Studio FLAC -> HQ)')
    setStatusMsg({
      type: 'info',
      text: `Acquiring [${songCode}] "${cand.title}" in ${format.toUpperCase()} [${modeLabel}]...`
    })

    try {
      const installed = await invokeFn('download_song', {
        query: cand.query || `${cand.artist} - ${cand.title}`,
        preferred_format: format,
        preferredFormat: format,
        acq_mode: acqMode,
        acqMode: acqMode,
        code: cand.code,
        exact_title: cand.title || cand.track,
        exactTitle: cand.title || cand.track,
        exact_artist: cand.artist,
        exactArtist: cand.artist,
        exact_url: cand.direct_url,
        exactUrl: cand.direct_url,
        expected_duration: cand.duration_sec || cand.duration,
        expectedDuration: cand.duration_sec || cand.duration,
        recording: cand
      })

      const rep = recordReportItem(installed, cand)
      const tier = rep.tier
      const tierIcon = tier === 'green' ? '🟢' : tier === 'yellow' ? '🟡' : tier === 'red' ? '🔴' : tier === 'white' ? '⚪' : '⏭️'

      setStatusMsg({
        type: installed?.skipped ? 'warn' : 'success',
        text: installed?.skipped
          ? `[${songCode}] "${installed.track}" already exists in library — duplicate skipped.`
          : `Installed "${installed.track}" [${tierIcon} ${installed.tier_label || tier}] to Library!`
      })
      if (onTrackInstalled) onTrackInstalled(installed)
    } catch (err) {
      console.error('Download error:', err)
      setStatusMsg({ type: 'error', text: err.message || 'Acquisition failed.' })
    } finally {
      setDownloadingMbid(null)
    }
  }

  // 3. Resolve Link Directly
  const handleResolveLinkDirect = async (url) => {
    if (!url.trim()) return
    setIsResolvingLink(true)
    setStatusMsg(null)
    setResolvedSongs([])
    setResolvedPlaylistTitle('')

    try {
      let songs = []
      const res = await invokeFn('resolve_playlist_url', { url: url.trim() })
      const parsed = typeof res === 'string' ? JSON.parse(res) : res
      if (parsed?.tracks && Array.isArray(parsed.tracks)) {
        songs = parsed.tracks
      } else if (parsed?.title) {
        songs = [parsed]
      } else if (Array.isArray(parsed)) {
        songs = parsed
      }

      const plTitle = parsed?.playlist_title || ''
      setResolvedPlaylistTitle(plTitle)
      setResolvedSongs(songs)

      if (songs.length === 0) {
        setStatusMsg({ type: 'warn', text: parsed?.message || 'Could not resolve audio streams from provided URL.' })
      } else {
        const titleMsg = plTitle ? ` "${plTitle}"` : ''
        setStatusMsg({ type: 'info', text: `Resolved ${songs.length} track(s) with unique codes from${titleMsg}! Ready to acquire.` })
      }
    } catch (err) {
      console.error('Link error:', err)
      setStatusMsg({ type: 'error', text: err.message || 'Link resolution failed.' })
    } finally {
      setIsResolvingLink(false)
    }
  }

  const handleResolveLink = (e) => {
    e?.preventDefault()
    handleResolveLinkDirect(linkInput)
  }

  // 3b. Download All Resolved Songs via 4-Tier Waterfall
  const handleDownloadAllResolved = async () => {
    if (resolvedSongs.length === 0) return
    setIsDownloadingAll(true)
    let installedCount = 0
    let skippedCount = 0

    let targetFolder = (resolvedPlaylistTitle || '').trim()
    try {
      const folderRes = await invokeFn('get_bunch_folder_name', {
        playlist_name: targetFolder || null,
        playlistName: targetFolder || null
      })
      if (folderRes && typeof folderRes === 'string') {
        targetFolder = folderRes
      }
    } catch (err) {
      if (!targetFolder) targetFolder = 'new1'
    }

    setStatusMsg({ type: 'info', text: `Starting 4-tier waterfall download into folder "${targetFolder}"...` })

    for (let i = 0; i < resolvedSongs.length; i++) {
      const s = resolvedSongs[i]
      const songTitle = s.title || s.track || 'Track'
      const songArtist = (s.artist && s.artist !== 'Unknown Artist') ? s.artist : ''
      const query = s.query || (songArtist ? `${songArtist} - ${songTitle}` : songTitle)
      const songCode = s.code || `#PL-${(i + 1).toString().padStart(2, '0')}`

      setStatusMsg({
        type: 'info',
        text: `[${i + 1}/${resolvedSongs.length}] Acquiring [${songCode}] "${songTitle}" (Waterfall: 🟢->🟡->🔴->⚪)...`
      })

      try {
        const res = await invokeFn('download_song', {
          query,
          target_dir: null,
          targetDir: null,
          playlist_name: targetFolder,
          playlistName: targetFolder,
          preferred_format: format,
          preferredFormat: format,
          acq_mode: acqMode,
          acqMode: acqMode,
          code: songCode,
          exact_title: songTitle,
          exactTitle: songTitle,
          exact_artist: songArtist,
          exactArtist: songArtist,
          exact_url: s.direct_url,
          exactUrl: s.direct_url,
          expected_duration: s.duration,
          expectedDuration: s.duration,
          recording: s
        })

        if (res) {
          recordReportItem(res, s)
          if (res.skipped) {
            skippedCount++
          } else {
            installedCount++
          }
          if (onTrackInstalled) onTrackInstalled(res)
        }
      } catch (e) {
        console.warn('Playlist item download notice:', songTitle, e)
        const failedItem = {
          code: songCode,
          title: songTitle,
          artist: songArtist,
          tier: 'failed',
          tier_label: 'Failed',
          how: e?.message || 'Download error',
          file_path: '',
          folder_path: '',
          size_mb: 0,
          skipped: false,
          status: 'Failed'
        }
        setDownloadReport(prev => [failedItem, ...prev.filter(x => x.code !== songCode)])
      }
    }

    setIsDownloadingAll(false)
    const summary = skippedCount > 0
      ? `Playlist complete! ${installedCount} acquired, ${skippedCount} duplicates skipped. See What/Where/How report below.`
      : `Playlist complete! Successfully installed ${installedCount}/${resolvedSongs.length} songs into folder "${targetFolder}".`
    setStatusMsg({
      type: 'success',
      text: summary
    })
  }

  // 4. Parse CSV
  const handleParseCsv = () => {
    if (!csvText.trim()) return
    const lines = csvText.trim().split(/\r?\n/).filter(l => l.trim())
    if (lines.length === 0) return

    const firstLineLower = lines[0].toLowerCase()
    const isHeader = firstLineLower.includes('track') || firstLineLower.includes('title') || firstLineLower.includes('song') || firstLineLower.includes('artist')
    
    let titleIdx = 0
    let artistIdx = 1
    let albumIdx = 2
    let startIdx = 0

    if (isHeader) {
      startIdx = 1
      const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''))
      const t = header.findIndex((h) => h.includes('track') || h.includes('title') || h.includes('song') || h.includes('name'))
      const a = header.findIndex((h) => h.includes('artist') || h.includes('singer') || h.includes('by'))
      const al = header.findIndex((h) => h.includes('album'))
      if (t !== -1) titleIdx = t
      if (a !== -1) artistIdx = a
      if (al !== -1) albumIdx = al
    }

    const rows = []
    for (let i = startIdx; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
      if (cols.length < 1 || !cols[0]) continue
      const title = cols[titleIdx] || cols[0]
      const artist = cols[artistIdx] || 'Unknown Artist'
      const album = cols[albumIdx] || 'Unknown Album'
      const code = `#CSV-${(i).toString().padStart(2, '0')}`
      rows.push({ code, title, artist, album })
    }

    setParsedCsvRows(rows)
    setStatusMsg({ type: 'info', text: `Parsed ${rows.length} tracks with codes from CSV. Ready for acquisition.` })
  }

  // 5. Batch Download CSV
  const handleBatchDownloadCsv = async () => {
    if (parsedCsvRows.length === 0) return
    setIsProcessingCsv(true)
    let installedCount = 0
    let skippedCount = 0

    let targetFolder = 'new1'
    try {
      const folderRes = await invokeFn('get_bunch_folder_name', { playlist_name: null, playlistName: null })
      if (folderRes && typeof folderRes === 'string') targetFolder = folderRes
    } catch {}

    setStatusMsg({ type: 'info', text: `Starting CSV batch waterfall download into "${targetFolder}"...` })

    for (let i = 0; i < parsedCsvRows.length; i++) {
      const item = parsedCsvRows[i]
      setStatusMsg({ type: 'info', text: `[${i + 1}/${parsedCsvRows.length}] Processing [${item.code}] "${item.title}"...` })
      try {
        const res = await invokeFn('download_song', {
          query: `${item.artist} - ${item.title}`,
          target_dir: null,
          targetDir: null,
          playlist_name: targetFolder,
          playlistName: targetFolder,
          preferred_format: format,
          preferredFormat: format,
          acq_mode: acqMode,
          acqMode: acqMode,
          code: item.code,
          exact_title: item.title,
          exactTitle: item.title,
          exact_artist: item.artist,
          exactArtist: item.artist
        })
        if (res) {
          recordReportItem(res, item)
          if (res.skipped) skippedCount++
          else installedCount++
          if (onTrackInstalled) onTrackInstalled(res)
        }
      } catch (e) {
        console.warn('Batch item failed:', item.title, e)
      }
    }

    setIsProcessingCsv(false)
    const csvSummary = `CSV batch complete! ${installedCount} acquired, ${skippedCount} duplicates skipped. See report table below.`
    setStatusMsg({ type: 'success', text: csvSummary })
  }

  // Copy Summary Table to Clipboard
  const handleCopyReport = () => {
    if (downloadReport.length === 0) return
    const rows = downloadReport.map(r => 
      `${r.code}\t${r.title}\t${r.artist}\t${r.tier.toUpperCase()}\t${r.how}\t${r.file_path || r.folder_path}`
    ).join('\n')
    const text = `CODE\tTITLE\tARTIST\tTIER\tHOW\tWHERE\n${rows}`
    navigator.clipboard.writeText(text).then(() => {
      setCopiedReport(true)
      setTimeout(() => setCopiedReport(false), 2000)
    })
  }

  // Calculate Report Counters
  const greenCount = downloadReport.filter(r => r.tier === 'green').length
  const yellowCount = downloadReport.filter(r => r.tier === 'yellow').length
  const redCount = downloadReport.filter(r => r.tier === 'red').length
  const whiteCount = downloadReport.filter(r => r.tier === 'white').length
  const skippedCount = downloadReport.filter(r => r.skipped || r.tier === 'skipped').length
  const content = (
    <div className={`w-full ${inline ? 'max-w-4xl mx-auto h-full' : 'max-w-2xl max-h-[92vh]'} flex flex-col glass-panel rounded-2xl sm:rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.85)] border border-white/10 overflow-hidden animate-slideUp`}>
        
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-black/40 backdrop-blur-xl">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-[0_0_12px_rgba(0,229,255,0.3)]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                <span>Acquire Music</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-500/40 text-cyan-300 font-mono">
                  4-Tier Waterfall
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">P2P Mesh FLAC • Master Transcode • High Bitrate • Lossless Guard</p>
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
              { id: 'flac', label: 'FLAC (Lossless 4-Tier)' },
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

        {/* Engine Acquisition Mode Pills */}
        <div className="px-5 pt-2 pb-2.5 flex items-center justify-between gap-2 border-b border-white/5 bg-zinc-950/70">
          <span className="text-[10px] font-bold text-zinc-400 tracking-wider">WATERFALL ENGINE:</span>
          <div className="flex gap-1.5">
            {[
              { id: 'hybrid', label: '⚡ 4-Tier Waterfall (P2P -> Studio FLAC -> HQ)', title: 'Tries Soulseek P2P FLAC first; auto-transcodes master audio to FLAC with ffmpeg' },
              { id: 'strict_lossless', label: '💎 Strict P2P Only', title: 'Only accepts verified 1411kbps+ Soulseek P2P FLAC' },
              { id: 'instant_studio', label: '🚀 Instant Studio', title: 'Bypasses P2P queues for instant studio master stream' }
            ].map((mode) => (
              <button
                key={mode.id}
                onClick={() => handleAcqModeChange(mode.id)}
                title={mode.title}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                  acqMode === mode.id
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-black shadow-[0_0_10px_rgba(52,211,153,0.5)]'
                    : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                }`}
              >
                {mode.label}
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
            <span>Search & Link</span>
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

          {downloadReport.length > 0 && (
            <button
              onClick={() => setActiveTab('report')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold border-b-2 transition ${
                activeTab === 'report'
                  ? 'border-emerald-400 text-emerald-400 bg-emerald-950/20'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Table className="w-4 h-4" />
              <span>Summary Report ({downloadReport.length})</span>
            </button>
          )}
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

          {/* TAB 1: Search & Download (With Auto-Link Detection) */}
          {activeTab === 'search' && (
            <div className="space-y-4">
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Enter track, artist, or paste Spotify / YouTube song link..."
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSearching || !searchQuery.trim()}
                  className="px-4 py-2.5 rounded-xl bg-cyan-500 text-black font-bold text-xs flex items-center gap-1.5 hover:bg-cyan-400 disabled:opacity-50 transition shrink-0"
                >
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Find</span>}
                </button>
              </form>

              {/* Candidates List with Code Pills */}
              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                {candidates.map((c, i) => {
                  const isDownloading = downloadingMbid === (c.mbid || c.title)
                  const code = c.code || c.mbid || `#SF-${i + 1}`
                  return (
                    <div
                      key={c.mbid || i}
                      className="flex items-center justify-between p-3 rounded-2xl bg-zinc-900/50 hover:bg-zinc-800/60 border border-white/5 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {c.cover || c.cover_url ? (
                          <img
                            src={c.cover || c.cover_url}
                            alt="Cover"
                            className="w-12 h-12 rounded-xl object-cover border border-white/10"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-500">
                            <Disc className="w-6 h-6" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded-md bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 font-mono text-[10px] font-bold">
                              {code}
                            </span>
                            <h4 className="text-sm font-bold text-white truncate">{c.title}</h4>
                          </div>
                          <p className="text-xs text-zinc-400 truncate mt-0.5">{c.artist}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-500">
                            <span>{c.album || 'Single'}</span>
                            <span>•</span>
                            <span>{Math.floor((c.duration_sec || c.duration || 180) / 60)}:{((c.duration_sec || c.duration || 180) % 60).toFixed(0).toString().padStart(2, '0')}</span>
                            {c.direct_url && (
                              <>
                                <span>•</span>
                                <span className="text-cyan-400">Direct Link Verified</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDownloadCandidate(c)}
                        disabled={isDownloading}
                        className="ml-3 p-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-black border border-cyan-500/30 transition disabled:opacity-50"
                        title="Acquire with 4-Tier Waterfall"
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
                    placeholder="Paste Spotify track/playlist, YouTube video/playlist, or Apple Music link..."
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 font-mono text-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isResolvingLink || !linkInput.trim()}
                  className="px-4 py-2.5 rounded-xl bg-cyan-500 text-black font-bold text-xs flex items-center gap-1.5 hover:bg-cyan-400 disabled:opacity-50 transition shrink-0"
                >
                  {isResolvingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Resolve</span>}
                </button>
              </form>

              {resolvedSongs.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs">
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="font-bold text-white truncate">
                        {resolvedPlaylistTitle || 'Resolved Music Link'}
                      </div>
                      <div className="text-[11px] text-cyan-400/80 font-mono">
                        {resolvedSongs.length} track(s) with unique codes • Target: {resolvedPlaylistTitle ? `"${resolvedPlaylistTitle}"` : 'Auto (new1, new2...)'}
                      </div>
                    </div>
                    <button
                      onClick={handleDownloadAllResolved}
                      disabled={isDownloadingAll}
                      className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-50 shrink-0 shadow-[0_0_12px_rgba(0,229,255,0.3)]"
                    >
                      {isDownloadingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      <span>{isDownloadingAll ? 'Acquiring...' : `Download All (${resolvedSongs.length})`}</span>
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                    {resolvedSongs.map((s, i) => (
                      <div
                        key={s.code || i}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 border border-white/5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-500/30 text-cyan-300 font-mono text-[10px] font-bold">
                              {s.code || `#SP-${i + 1}`}
                            </span>
                            <h5 className="text-sm font-bold text-white truncate">{s.title || s.track}</h5>
                          </div>
                          <p className="text-xs text-zinc-400 truncate mt-0.5">{s.artist}</p>
                        </div>
                        <button
                          onClick={() => handleDownloadCandidate(s)}
                          className="ml-3 p-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-black border border-cyan-500/30 transition"
                          title="Acquire this track"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
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

          {/* TAB 4: Download Summary Table (What, Where, How) */}
          {activeTab === 'report' && (
            <div className="space-y-4">
              {/* Summary Stats Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-zinc-900/80 border border-white/10 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-bold flex items-center gap-1">
                    <span>🟢 P2P FLAC:</span>
                    <span className="font-mono">{greenCount}</span>
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-amber-950/80 border border-amber-500/40 text-amber-300 font-bold flex items-center gap-1">
                    <span>🟡 Studio FLAC:</span>
                    <span className="font-mono">{yellowCount}</span>
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-rose-950/80 border border-rose-500/40 text-rose-300 font-bold flex items-center gap-1">
                    <span>🔴 HQ 320k:</span>
                    <span className="font-mono">{redCount}</span>
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-zinc-800 border border-white/20 text-zinc-300 font-bold flex items-center gap-1">
                    <span>⚪ Fallback:</span>
                    <span className="font-mono">{whiteCount}</span>
                  </span>
                  {skippedCount > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 font-bold flex items-center gap-1">
                      <span>⏭️ Skipped:</span>
                      <span className="font-mono">{skippedCount}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  {downloadReport.some(r => r.tier !== 'green') && (
                    <button
                      onClick={handleUpgradeAll}
                      disabled={isUpgrading}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition ${
                        isUpgrading
                          ? 'bg-emerald-500/20 text-emerald-300 cursor-not-allowed border border-emerald-500/40 animate-pulse'
                          : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20 font-black'
                      }`}
                      title="Rerun Soulseek P2P for all non-lossless tracks; replace only if superior FLAC is acquired"
                    >
                      {isUpgrading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Refining to FLAC...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5 fill-black" />
                          <span>⚡ Refine Non-Lossless to Green Dot FLAC</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    onClick={handleCopyReport}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition"
                  >
                    {copiedReport ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedReport ? 'Copied!' : 'Copy Table'}</span>
                  </button>
                </div>
              </div>

              {/* The What, Where, How Table */}
              <div className="rounded-2xl border border-white/10 overflow-hidden bg-zinc-950/60">
                <div className="overflow-x-auto max-h-[380px]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-black/80 text-zinc-400 font-mono text-[10px] uppercase border-b border-white/10 sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-3">Code</th>
                        <th className="py-2.5 px-3">Song (What)</th>
                        <th className="py-2.5 px-3">Quality Tier</th>
                        <th className="py-2.5 px-3">Method (How)</th>
                        <th className="py-2.5 px-3">Location (Where)</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-sans">
                      {downloadReport.map((row, idx) => {
                        const tierColor =
                          row.tier === 'green'
                            ? 'text-emerald-400'
                            : row.tier === 'yellow'
                            ? 'text-amber-400'
                            : row.tier === 'red'
                            ? 'text-rose-400'
                            : row.tier === 'white'
                            ? 'text-zinc-200'
                            : 'text-cyan-400'

                        const dotIcon =
                          row.tier === 'green'
                            ? '🟢'
                            : row.tier === 'yellow'
                            ? '🟡'
                            : row.tier === 'red'
                            ? '🔴'
                            : row.tier === 'white'
                            ? '⚪'
                            : '⏭️'

                        return (
                          <tr key={idx} className="hover:bg-white/5 transition">
                            {/* CODE */}
                            <td className="py-2 px-3 font-mono font-bold text-[10px] text-cyan-300 whitespace-nowrap">
                              {row.code}
                            </td>

                            {/* WHAT (Song & Artist) */}
                            <td className="py-2 px-3 min-w-[140px]">
                              <div className="font-bold text-white truncate max-w-[180px]" title={row.title}>
                                {row.title}
                              </div>
                              <div className="text-[10px] text-zinc-400 truncate max-w-[180px]">
                                {row.artist}
                              </div>
                            </td>

                            {/* TIER DOT */}
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1.5 font-semibold text-[11px] ${tierColor}`}>
                                <span>{dotIcon}</span>
                                <span>{row.tier_label || row.tier}</span>
                              </span>
                            </td>

                            {/* HOW */}
                            <td className="py-2 px-3 text-[11px] text-zinc-300 max-w-[140px] truncate" title={row.how}>
                              {row.how}
                            </td>

                            {/* WHERE */}
                            <td className="py-2 px-3 text-[10px] font-mono text-zinc-400 max-w-[180px] truncate" title={row.file_path || row.folder_path}>
                              {row.file_path ? row.file_path.split('/').slice(-2).join('/') : row.folder_path}
                            </td>

                            {/* ACTION */}
                            <td className="py-2 px-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                {row.tier !== 'green' && (
                                  <button
                                    onClick={() => handleUpgradeSingle(row)}
                                    disabled={isUpgrading || upgradingCodes.includes(row.code)}
                                    className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/30 text-emerald-400 transition"
                                    title="Search Soulseek mesh & upgrade to Green Dot FLAC if better"
                                  >
                                    <RefreshCw
                                      className={`w-3.5 h-3.5 ${
                                        upgradingCodes.includes(row.code) ? 'animate-spin text-amber-400' : ''
                                      }`}
                                    />
                                  </button>
                                )}
                                {row.folder_path && (
                                  <button
                                    onClick={() => invokeFn('open_folder', { folder_path: row.folder_path })}
                                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white transition"
                                    title="Open in File Manager"
                                  >
                                    <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Persistent Mini Report Banner if downloads performed while in other tabs */}
          {activeTab !== 'report' && downloadReport.length > 0 && (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-900/90 border border-cyan-500/30 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">Acquisition Report:</span>
                <span className="text-zinc-400 font-mono">
                  {downloadReport.length} tracks (🟢{greenCount} 🟡{yellowCount} 🔴{redCount} ⚪{whiteCount} ⏭️{skippedCount})
                </span>
              </div>
              <button
                onClick={() => setActiveTab('report')}
                className="px-3 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500 text-cyan-400 hover:text-black font-bold text-xs border border-cyan-400/40 transition"
              >
                View Full What/Where/How Table →
              </button>
            </div>
          )}

        </div>
      </div>
  )

  if (inline) {
    return (
      <div className="w-full h-full flex flex-col bg-[#07090E] text-white pt-6 px-3 sm:px-6 pb-28 select-none overflow-hidden font-sans">
        {content}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-2xl transition-all duration-300 select-none">
      {content}
    </div>
  )
}
