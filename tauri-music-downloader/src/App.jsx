import React, { useState, useEffect, useRef, useMemo } from 'react'
import { invoke, getServerUrl, setServerUrl } from './apiBridge'
import { 
  LayoutDashboard, Music, Disc, Users, DownloadCloud, FileSpreadsheet, 
  Link2, Search, Folder, FolderOpen, RefreshCw, CheckCircle2, AlertCircle, 
  X, Check, ArrowRight, Disc3, HardDrive, ListMusic, Plus, Clock, FileText,
  ChevronDown, ChevronLeft, Sliders, ChevronRight, UploadCloud, Layers,
  Play, Pause, ExternalLink, Sparkles, Mic2, Info, Eye, User, ShieldCheck, Key,
  LogOut, Radio, Wifi, WifiOff, Menu
} from 'lucide-react'

export default function App() {
  // Navigation: 'overview' | 'tracks' | 'albums' | 'artists' | 'install' | 'showcase' | 'album_detail'
  const [currentNav, setCurrentNav] = useState('tracks')
  
  // Responsive Mobile Navigation & Sliding Drawer
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false)
  const touchStartXRef = useRef(0)
  const touchStartYRef = useRef(0)

  // Install sub-tab: 'single' | 'csv' | 'playlist'
  const [installTab, setInstallTab] = useState('single')

  // Storage and config
  const [saveDir, setSaveDir] = useState('')
  const [library, setLibrary] = useState([])
  const [coverCache, setCoverCache] = useState({})
  const [globalFilter, setGlobalFilter] = useState('')

  // Audio Format Preference: 'flac' (Lossless/Soulseek) | 'mp3' (320kbps) | 'wav' (Lossless PCM) | 'm4a' (256kbps AAC)
  const [audioFormat, setAudioFormat] = useState('flac')

  // Soulseek / Sockseek Profile & Auth Modal State
  const [soulseekProfile, setSoulseekProfile] = useState({
    username: '',
    logged_in: false,
    status: 'Checking P2P status...',
    output_dir: '',
    pref_format: 'flac,mp3'
  })
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [authUsername, setAuthUsername] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authMsg, setAuthMsg] = useState(null)
  const [serverHostUrl, setServerHostUrl] = useState(() => getServerUrl())

  // Selected Track for Showcase / Lyrics View (Image 1)
  const [showcaseTrack, setShowcaseTrack] = useState(null)
  const [showcaseTab, setShowcaseTab] = useState('lyrics') // 'lyrics' | 'details' | 'related'
  const [lyricsLines, setLyricsLines] = useState([])
  const [activeLyricIndex, setActiveLyricIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const audioPlayerRef = useRef(null)

  // Selected Album for Detail View (Image 2)
  const [selectedAlbum, setSelectedAlbum] = useState(null)

  // 1. Single Song Search State
  const [singleSong, setSingleSong] = useState('')
  const [singleArtist, setSingleArtist] = useState('')
  const [singleSearching, setSingleSearching] = useState(false)
  const [singleResults, setSingleResults] = useState(null)
  const [singleError, setSingleError] = useState('')

  // Download Confirmation Modal
  const [promptTrack, setPromptTrack] = useState(null)
  const [promptOverrideAlbum, setPromptOverrideAlbum] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadStatus, setDownloadStatus] = useState('')

  // 2. CSV Import State
  const [csvText, setCsvText] = useState('')
  const [csvParsedTracks, setCsvParsedTracks] = useState([])
  const [csvSelectedIndices, setCsvSelectedIndices] = useState([])
  const [batchProgress, setBatchProgress] = useState(null)
  const [batchDownloading, setBatchDownloading] = useState(false)

  // 3. Playlist Link State
  const [playlistUrl, setPlaylistUrl] = useState('')
  const [playlistFetching, setPlaylistFetching] = useState(false)
  const [playlistTracks, setPlaylistTracks] = useState([])
  const [playlistSelectedIndices, setPlaylistSelectedIndices] = useState([])
  const [playlistError, setPlaylistError] = useState('')
  const [playlistDownloading, setPlaylistDownloading] = useState(false)
  const [playlistProgress, setPlaylistProgress] = useState(null)

  // First-Run Permission & Setup State
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return !localStorage.getItem('sherofetch_onboarded')
    } catch {
      return false
    }
  })

  const handleGrantPermissions = async () => {
    try {
      const { Filesystem } = await import('@capacitor/filesystem')
      if (Filesystem && Filesystem.requestPermissions) {
        await Filesystem.requestPermissions()
      }
    } catch (e) {
      console.warn('Native permission request:', e)
    }
    try {
      localStorage.setItem('sherofetch_onboarded', 'true')
    } catch {}
    setShowOnboarding(false)
  }

  useEffect(() => {
    invoke('get_config')
      .then((cfg) => {
        if (cfg && cfg.install_dir) {
          setSaveDir(cfg.install_dir)
        }
      })
      .catch(() => {})

    loadSoulseekProfile()
    loadLibrary()
  }, [])

  const loadSoulseekProfile = async () => {
    try {
      const prof = await invoke('get_soulseek_profile')
      if (prof) {
        setSoulseekProfile(prof)
        if (prof.username) setAuthUsername(prof.username)
        // If not logged in, prompt user on first launch
        if (!prof.logged_in && !sessionStorage.getItem('soulseek_prompted')) {
          sessionStorage.setItem('soulseek_prompted', 'true')
          setIsAuthModalOpen(true)
        }
      }
    } catch (e) {
      console.warn('Could not load Soulseek profile:', e)
    }
  }

  const handleSoulseekLogin = async (e) => {
    if (e) e.preventDefault()
    if (!authUsername.trim()) {
      setAuthMsg({ type: 'error', text: 'Please enter a valid Soulseek username.' })
      return
    }
    setAuthLoading(true)
    setAuthMsg(null)
    try {
      setServerUrl(serverHostUrl)
      const res = await invoke('save_soulseek_profile', {
        username: authUsername.trim(),
        password: authPassword.trim()
      })
      if (res) {
        setSoulseekProfile(res)
        setAuthMsg({ type: 'success', text: `Verified & connected as ${res.username}!` })
        setTimeout(() => {
          setIsAuthModalOpen(false)
          setAuthMsg(null)
        }, 1200)
      }
    } catch (err) {
      setAuthMsg({ type: 'error', text: err.message || `Connection failed: ${err}` })
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSoulseekLogout = async () => {
    setAuthLoading(true)
    try {
      await invoke('logout_soulseek_profile')
      setSoulseekProfile({
        username: '',
        logged_in: false,
        status: 'Not Connected',
        output_dir: '',
        pref_format: 'flac,mp3'
      })
      setAuthUsername('')
      setAuthPassword('')
      setAuthMsg({ type: 'info', text: 'Logged out of Soulseek.' })
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      setAuthLoading(false)
    }
  }

  const loadLibrary = async () => {
    try {
      const items = await invoke('get_library')
      setLibrary(items || [])

      if (items && items.length > 0) {
        for (const item of items) {
          if (item.cover_path && !coverCache[item.cover_path]) {
            invoke('read_cover_base64', { path: item.cover_path })
              .then((dataUrl) => {
                setCoverCache((prev) => ({ ...prev, [item.cover_path]: dataUrl }))
              })
              .catch(() => {})
          }
        }
        // Default showcase track if none selected
        if (!showcaseTrack) {
          selectTrackForShowcase(items[0], false)
        }
      }
    } catch (err) {
      console.error('Failed to load library:', err)
    }
  }

  // --- SHOWCASE & LYRICS VIEW (Image 1) ---
  const togglePlayTrack = (track) => {
    const target = track || showcaseTrack
    if (!target) return
    const audioUrl = target.file_url || target.audio_stream_url || target.file_path
    if (!audioUrl) return

    if (audioPlayerRef.current) {
      if (isPlaying) {
        audioPlayerRef.current.pause()
        setIsPlaying(false)
        return
      } else {
        audioPlayerRef.current.play().then(() => setIsPlaying(true)).catch(console.warn)
        return
      }
    }

    const audio = new Audio(audioUrl)
    audioPlayerRef.current = audio
    audio.ontimeupdate = () => {
      const cur = audio.currentTime
      setLyricsLines(prev => {
        if (prev && prev.length > 0) {
          for (let i = prev.length - 1; i >= 0; i--) {
            if (cur >= prev[i].time) {
              setActiveLyricIndex(i)
              break
            }
          }
        }
        return prev
      })
    }
    audio.onended = () => setIsPlaying(false)
    audio.play().then(() => setIsPlaying(true)).catch(console.warn)
  }

  const selectTrackForShowcase = async (track, navigate = true) => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause()
      audioPlayerRef.current = null
      setIsPlaying(false)
    }
    setShowcaseTrack(track)
    setActiveLyricIndex(0)
    setLyricsLines([])

    if (track.lrc_path) {
      try {
        const rawLrc = await invoke('read_lrc_content', { path: track.lrc_path })
        parseLrc(rawLrc)
      } catch (err) {
        setLyricsLines([
          { time: 0, text: 'No synchronized lyrics file (.lrc) available for this song.' }
        ])
      }
    } else {
      setLyricsLines([
        { time: 0, text: 'No synchronized lyrics recorded for this song.' }
      ])
    }

    if (navigate) {
      setCurrentNav('showcase')
    }
  }

  const parseLrc = (lrcString) => {
    const lines = lrcString.split(/\r?\n/)
    const parsed = []
    const timeReg = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/

    for (const line of lines) {
      const match = timeReg.exec(line)
      if (match) {
        const min = parseInt(match[1], 10)
        const sec = parseInt(match[2], 10)
        const text = line.replace(timeReg, '').trim()
        if (text) {
          parsed.push({
            time: min * 60 + sec,
            text: text
          })
        }
      } else {
        const clean = line.replace(/\[.*?\]/g, '').trim()
        if (clean && !clean.startsWith('ar:') && !clean.startsWith('ti:') && !clean.startsWith('al:')) {
          parsed.push({ time: 0, text: clean })
        }
      }
    }

    if (parsed.length > 0) {
      setLyricsLines(parsed)
      setActiveLyricIndex(Math.min(1, parsed.length - 1))
    } else {
      setLyricsLines([{ time: 0, text: 'Lyrics file was empty or unparseable.' }])
    }
  }

  const handleTouchStart = (e) => {
    if (e.touches && e.touches[0]) {
      touchStartXRef.current = e.touches[0].clientX
      touchStartYRef.current = e.touches[0].clientY
    }
  }

  const handleTouchEnd = (e) => {
    if (e.changedTouches && e.changedTouches[0]) {
      const deltaX = e.changedTouches[0].clientX - touchStartXRef.current
      const deltaY = e.changedTouches[0].clientY - touchStartYRef.current
      if (Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && Math.abs(deltaX) > 60) {
        if (deltaX > 0 && touchStartXRef.current < 50) {
          setIsMobileDrawerOpen(true)
        } else if (deltaX < 0 && isMobileDrawerOpen) {
          setIsMobileDrawerOpen(false)
        }
      }
    }
  }

  const handleBrowseFolder = async () => {
    try {
      const selected = await invoke('choose_folder', { currentDir: saveDir })
      if (selected) {
        setSaveDir(selected)
      }
    } catch (err) {
      console.error('Folder picker error:', err)
      alert(`Authoritative Music Vault:\n${saveDir}\n\nDownloaded files are synchronized with your Android Music directory.`)
    }
  }

  const handleOpenFolder = async (folderPath) => {
    if (!folderPath) return
    try {
      await invoke('open_folder', { folderPath })
    } catch (err) {
      console.error('Error opening folder:', err)
    }
  }

  const handleOpenFileInPlayer = async (filePath) => {
    if (!filePath) return
    try {
      await invoke('open_file', { filePath })
    } catch (err) {
      console.error('Error opening file in player:', err)
    }
  }

  // --- 1. Single Song Search ---
  const handleSingleSearch = async (e) => {
    if (e) e.preventDefault()
    let query = singleArtist ? `${singleArtist} - ${singleSong}` : singleSong
    const trimmed = singleSong.trim()
    if (!query.trim() && !trimmed) return

    // If user pasted a URL (Spotify, YouTube, Apple Music, etc.)
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      setSingleSearching(true)
      setSingleError('')
      try {
        const urlRes = await invoke('resolve_song_url', { url: trimmed })
        const urlData = JSON.parse(urlRes)
        if (urlData.status === 'ok' && urlData.title) {
          setSingleSong(urlData.title)
          if (urlData.artist) setSingleArtist(urlData.artist)
          query = `${urlData.artist || ''} - ${urlData.title}`.trim().replace(/^-\s*/, '')
        }
      } catch (uErr) {
        console.warn('URL auto-resolve warning:', uErr)
      }
    }

    setSingleSearching(true)
    setSingleError('')
    try {
      const res = await invoke('search_song_candidates', { query: query.trim() })
      const parsed = JSON.parse(res)
      setSingleResults(parsed)
    } catch (err) {
      setSingleError(`Search failed: ${err}`)
    } finally {
      setSingleSearching(false)
    }
  }

  const openDownloadModal = (item) => {
    setPromptTrack(item)
    setPromptOverrideAlbum(false)
    setDownloadStatus('')
  }

  const confirmSingleDownload = async () => {
    if (!promptTrack) return
    setDownloading(true)
    setDownloadStatus('Initializing pipeline...')

    const queryStr = `${promptTrack.artist} - ${promptTrack.title}`
    const overrideAlbum = promptOverrideAlbum ? 'Unknown Album' : null

    try {
      setDownloadStatus(`Downloading ${audioFormat.toUpperCase()} & validating quality gates...`)
      const downloaded = await invoke('download_song', {
        query: queryStr,
        targetDir: saveDir,
        selectionIndex: 0,
        overrideAlbum: overrideAlbum,
        preferredFormat: audioFormat
      })

      setDownloadStatus('Finalizing tags & artwork...')
      await loadLibrary()
      setPromptTrack(null)
      selectTrackForShowcase(downloaded, true)
    } catch (err) {
      setSingleError(String(err))
    } finally {
      setDownloading(false)
    }
  }

  // --- 2. CSV Parsing & Batch Download ---
  const parseCsvContent = (content) => {
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const tracks = []
    let titleFirst = false
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const parts = line.split(/[,;\t]/).map(p => p.replace(/^["']|["']$/g, '').trim())
      if (parts.length >= 2) {
        const p0 = parts[0].toLowerCase()
        const p1 = parts[1].toLowerCase()
        if (p0 === 'title' || p0 === 'track' || p0 === 'song') {
          titleFirst = true
          continue
        }
        if (p0 === 'artist') {
          titleFirst = false
          continue
        }
        const artist = titleFirst ? parts[1] : parts[0]
        const title = titleFirst ? parts[0] : parts[1]
        tracks.push({
          artist,
          title,
          query: `${artist} - ${title}`
        })
      } else if (parts.length === 1 && parts[0].includes('-')) {
        const sub = parts[0].split('-').map(s => s.trim())
        tracks.push({
          artist: sub[0],
          title: sub.slice(1).join('-'),
          query: parts[0]
        })
      }
    }
    
    setCsvParsedTracks(tracks)
    setCsvSelectedIndices(tracks.map((_, idx) => idx))
  }

  const handleCsvFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target.result
      setCsvText(text)
      parseCsvContent(text)
    }
    reader.readAsText(file)
  }

  const runCsvBatchDownload = async () => {
    const selectedTracks = csvSelectedIndices.map(i => csvParsedTracks[i]).filter(Boolean)
    if (selectedTracks.length === 0) return

    setBatchDownloading(true)
    for (let i = 0; i < selectedTracks.length; i++) {
      const trk = selectedTracks[i]
      setBatchProgress({
        current: i + 1,
        total: selectedTracks.length,
        trackName: trk.query,
        status: `Downloading ${i + 1}/${selectedTracks.length}: ${trk.query}...`
      })

      try {
        await invoke('download_song', {
          query: trk.query,
          targetDir: saveDir,
          selectionIndex: 0,
          overrideAlbum: null,
          preferredFormat: audioFormat
        })
        await loadLibrary()
      } catch (e) {
        console.error(`Failed to download ${trk.query}:`, e)
      }
    }

    setBatchProgress(null)
    setBatchDownloading(false)
    await loadLibrary()
    setCurrentNav('tracks')
  }

  // --- 3. Playlist Resolver & Download ---
  const handleFetchPlaylist = async (e) => {
    if (e) e.preventDefault()
    if (!playlistUrl.trim()) return
    setPlaylistFetching(true)
    setPlaylistError('')
    try {
      const res = await invoke('resolve_playlist_url', { url: playlistUrl.trim() })
      const data = JSON.parse(res)
      if (data.status === 'ok' && data.tracks) {
        setPlaylistTracks(data.tracks)
        setPlaylistSelectedIndices(data.tracks.map((_, idx) => idx))
      } else {
        setPlaylistError(data.message || 'Failed to extract playlist')
      }
    } catch (err) {
      setPlaylistError(String(err))
    } finally {
      setPlaylistFetching(false)
    }
  }

  const runPlaylistDownload = async () => {
    const selectedTracks = playlistSelectedIndices.map(i => playlistTracks[i]).filter(Boolean)
    if (selectedTracks.length === 0) return

    setPlaylistDownloading(true)
    for (let i = 0; i < selectedTracks.length; i++) {
      const trk = selectedTracks[i]
      setPlaylistProgress({
        current: i + 1,
        total: selectedTracks.length,
        trackName: trk.query,
        status: `Acquiring ${i + 1}/${selectedTracks.length}: ${trk.query}...`
      })

      try {
        await invoke('download_song', {
          query: trk.query,
          targetDir: saveDir,
          selectionIndex: 0,
          overrideAlbum: null,
          preferredFormat: audioFormat
        })
        await loadLibrary()
      } catch (e) {
        console.error(`Failed to download ${trk.query}:`, e)
      }
    }

    setPlaylistProgress(null)
    setPlaylistDownloading(false)
    await loadLibrary()
    setCurrentNav('tracks')
  }

  // Derived Library Views
  const filteredLibrary = useMemo(() => {
    if (!globalFilter.trim()) return library
    const f = globalFilter.toLowerCase()
    return library.filter(item => 
      item.track.toLowerCase().includes(f) ||
      item.artist.toLowerCase().includes(f) ||
      item.album.toLowerCase().includes(f)
    )
  }, [library, globalFilter])

  const albumsGrouped = useMemo(() => {
    const map = {}
    for (const item of filteredLibrary) {
      const key = `${item.artist} - ${item.album}`
      if (!map[key]) {
        map[key] = {
          album: item.album,
          artist: item.artist,
          year: item.year,
          cover_path: item.cover_path,
          folder_path: item.folder_path,
          tracks: []
        }
      }
      map[key].tracks.push(item)
    }
    return Object.values(map)
  }, [filteredLibrary])

  const artistsGrouped = useMemo(() => {
    const map = {}
    for (const item of filteredLibrary) {
      const key = item.artist
      if (!map[key]) {
        map[key] = {
          artist: item.artist,
          tracksCount: 0,
          albumsSet: new Set(),
          sampleCover: item.cover_path
        }
      }
      map[key].tracksCount++
      map[key].albumsSet.add(item.album)
    }
    return Object.values(map).map(a => ({
      artist: a.artist,
      tracksCount: a.tracksCount,
      albumsCount: a.albumsSet.size,
      sampleCover: a.sampleCover
    }))
  }, [filteredLibrary])

  const totalStorageMb = useMemo(() => {
    return library.reduce((acc, cur) => acc + (cur.file_size_mb || 0), 0).toFixed(1)
  }, [library])

  const currentCoverUrl = showcaseTrack?.cover_path ? coverCache[showcaseTrack.cover_path] : null

  return (
    <div 
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="h-screen w-screen flex bg-[#080b12] text-slate-100 font-sans antialiased overflow-hidden select-none relative"
    >
      
      {/* --- POWERAMP-STYLE AMBIENT STUDIO MESH BACKDROP --- */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Deep studio ambient glow orbs */}
        <div className="absolute -top-32 -left-32 w-[32rem] h-[32rem] rounded-full bg-indigo-600/15 blur-[128px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute -bottom-32 -right-32 w-[32rem] h-[32rem] rounded-full bg-purple-600/15 blur-[128px] animate-pulse" style={{ animationDuration: '10s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] rounded-full bg-cyan-600/10 blur-[160px]" />

        {/* Dynamic Album-Reactive Glow when track is selected/playing */}
        {currentCoverUrl && (
          <div 
            className="absolute inset-0 transition-all duration-1000 ease-in-out opacity-45"
            style={{
              backgroundImage: `url(${currentCoverUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(70px) saturate(220%)',
              transform: 'scale(1.25)'
            }}
          />
        )}
        
        {/* Soft Vignette Overlay for Crisp Typography & Contrast */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#080b12]/50 via-[#080b12]/75 to-[#080b12]/92 backdrop-contrast-125" />
      </div>

      {/* --- MOBILE DRAWER BACKDROP (Tap to close sidebar) --- */}
      {isMobileDrawerOpen && (
        <div 
          onClick={() => setIsMobileDrawerOpen(false)}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300"
        />
      )}

      {/* --- RESPONSIVE SIDEBAR (SLIDING DRAWER ON MOBILE, DOCKED ON DESKTOP) --- */}
      <aside 
        className={`fixed md:relative inset-y-0 left-0 z-50 w-72 md:w-64 flex-shrink-0 bg-[#0d1117]/95 md:bg-[#0d1117]/90 backdrop-blur-2xl border-r border-slate-800/80 flex flex-col justify-between transition-transform duration-300 ease-in-out shadow-2xl md:shadow-none ${
          isMobileDrawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex flex-col">
          {/* App Branding & Mobile Close Button */}
          <div className="p-5 flex items-center justify-between border-b border-slate-800/60">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Disc3 className="w-5 h-5 text-white animate-spin-slow" />
              </div>
              <div>
                <span className="text-sm font-black text-white tracking-wider flex items-center gap-1.5">
                  SHEROFETCH <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-400 font-mono font-bold">VAULT</span>
                </span>
                <p className="text-[10px] text-slate-400 font-medium">Lossless Media & Lyrics</p>
              </div>
            </div>

            {/* Close Button on Mobile Drawer */}
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(false)}
              className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white md:hidden transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <div className="p-3 space-y-6">
            
            {/* Install & Acquisition Section (Prominent Sidebar Button) */}
            <div>
              <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase px-3 mb-2">
                Acquisition
              </div>
              <button
                onClick={() => {
                  setCurrentNav('install')
                  setIsMobileDrawerOpen(false)
                }}
                className={`w-full p-2.5 rounded-xl font-bold text-xs flex items-center justify-between transition-all cursor-pointer ${
                  currentNav === 'install'
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'bg-indigo-950/30 border border-indigo-900/40 text-indigo-300 hover:bg-indigo-900/40 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <DownloadCloud className="w-4 h-4" />
                  <span>Install / Downloader</span>
                </div>
                <span className="text-[9px] bg-white/20 text-white font-mono px-1.5 py-0.5 rounded-full font-bold">
                  MULTI
                </span>
              </button>
            </div>

            {/* Library Section */}
            <div>
              <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase px-3 mb-2">
                My Library
              </div>
              <nav className="space-y-1">
                <button
                  onClick={() => {
                    setCurrentNav('overview')
                    setIsMobileDrawerOpen(false)
                  }}
                  className={`w-full px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-3 transition-colors cursor-pointer ${
                    currentNav === 'overview'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4 text-indigo-400" />
                  <span>Home</span>
                </button>

                <button
                  onClick={() => {
                    setCurrentNav('tracks')
                    setIsMobileDrawerOpen(false)
                  }}
                  className={`w-full px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                    currentNav === 'tracks'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Music className="w-4 h-4 text-pink-400" />
                    <span>Tracks</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">{library.length}</span>
                </button>

                <button
                  onClick={() => {
                    setCurrentNav('albums')
                    setIsMobileDrawerOpen(false)
                  }}
                  className={`w-full px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                    currentNav === 'albums' || currentNav === 'album_detail'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Disc className="w-4 h-4 text-purple-400" />
                    <span>Albums</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">{albumsGrouped.length}</span>
                </button>

                <button
                  onClick={() => {
                    setCurrentNav('artists')
                    setIsMobileDrawerOpen(false)
                  }}
                  className={`w-full px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                    currentNav === 'artists'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 text-cyan-400" />
                    <span>Artists</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">{artistsGrouped.length}</span>
                </button>

                {/* Now Showcasing / Lyrics Button */}
                {showcaseTrack && (
                  <button
                    onClick={() => {
                      setCurrentNav('showcase')
                      setIsMobileDrawerOpen(false)
                    }}
                    className={`w-full px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-3 transition-colors cursor-pointer ${
                      currentNav === 'showcase'
                        ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                        : 'text-indigo-400 hover:text-indigo-200 hover:bg-slate-850'
                    }`}
                  >
                    <Mic2 className="w-4 h-4 text-indigo-400" />
                    <span className="truncate">Lyrics View</span>
                  </button>
                )}
              </nav>
            </div>
          </div>
        </div>

        {/* Drawer Bottom Actions: Soulseek Profile & Storage Vault */}
        <div className="p-3 border-t border-slate-800/80 space-y-2">
          {/* Soulseek Connection Card in Drawer */}
          <div
            onClick={() => {
              setIsAuthModalOpen(true)
              setIsMobileDrawerOpen(false)
            }}
            className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-emerald-500/40 cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Radio className={`w-3.5 h-3.5 ${soulseekProfile.logged_in ? 'text-emerald-400' : 'text-rose-400'}`} />
                <span>Soulseek Node</span>
              </div>
              <div className={`w-2 h-2 rounded-full ${soulseekProfile.logged_in ? 'bg-emerald-400' : 'bg-rose-500'}`} />
            </div>
            <div className="text-[11px] text-slate-400 truncate font-mono">
              {soulseekProfile.logged_in ? soulseekProfile.username : 'Disconnected (Optional)'}
            </div>
          </div>

          {/* Storage Location Card */}
          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/70">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                <Folder className="w-3.5 h-3.5 text-indigo-400" />
                <span>Storage Vault</span>
              </div>
              <button
                type="button"
                onClick={handleBrowseFolder}
                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer"
              >
                Change
              </button>
            </div>
            <div className="text-[10px] font-mono text-slate-300 truncate bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
              {saveDir}
            </div>
          </div>
        </div>
      </aside>

      {/* --- MAIN WORKSPACE --- */}
      <div className="flex-1 flex flex-col min-w-0 z-10 relative h-full">
        
        {/* Top App Header */}
        <header className="min-h-16 px-4 md:px-6 py-2.5 border-b border-slate-800/60 bg-[#0d1117]/80 backdrop-blur-md flex items-center justify-between gap-3 flex-shrink-0 z-20">
          
          {/* Mobile Hamburger Menu Button & Branding */}
          <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(prev => !prev)}
              className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white md:hidden flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform cursor-pointer"
              aria-label="Open Navigation Drawer"
            >
              <Menu className="w-5 h-5 text-indigo-400" />
            </button>

            {/* App Brand on Mobile */}
            <div className="flex md:hidden items-center gap-2 flex-shrink-0">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow">
                <Disc3 className="w-4 h-4 text-white animate-spin-slow" />
              </div>
              <span className="text-xs font-black tracking-wider text-white">SheroFetch</span>
            </div>

            {/* Global Search / Filter Input */}
            <div className="relative flex-1 max-w-md hidden sm:block">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder="Filter library tracks, albums, or artists..."
                className="w-full pl-10 pr-4 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3 text-xs font-mono text-slate-400 flex-shrink-0">
            {/* Soulseek Profile / Login Indicator */}
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-1.5 rounded-xl border transition-all cursor-pointer active:scale-95 ${
                soulseekProfile.logged_in
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/40 shadow-sm'
                  : 'bg-rose-950/40 border-rose-500/50 text-rose-300 hover:bg-rose-900/40'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${soulseekProfile.logged_in ? 'bg-emerald-400' : 'bg-rose-500'}`} />
              <User className="w-3.5 h-3.5" />
              <span className="font-semibold font-sans text-[11px] md:text-xs truncate max-w-[85px] md:max-w-[140px]">
                {soulseekProfile.logged_in ? soulseekProfile.username : 'Sign In (Optional)'}
              </span>
            </button>

            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900/80 border border-slate-800">
              <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
              <span>{totalStorageMb} MB</span>
            </div>

            <button
              onClick={loadLibrary}
              title="Reload from index.json"
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
            </button>
          </div>
        </header>

        {/* Mobile-only Quick Search Bar */}
        <div className="sm:hidden px-4 pt-2.5">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Filter songs, albums, artists..."
              className="w-full pl-10 pr-4 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Scrollable View Area (with bottom padding for Android bottom navigation) */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-28 md:pb-6 min-h-0">
          
          {/* ========================================================================= */}
          {/* VIEW 1: IMMERSIVE LYRICS & TRACK SHOWCASE (IMAGE 1 STYLE) */}
          {/* ========================================================================= */}
          {currentNav === 'showcase' && showcaseTrack && (
            <div className="h-full flex flex-col justify-between max-w-6xl mx-auto space-y-6 animate-fadeIn">
              
              {/* Top Navigation Row */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setCurrentNav('tracks')}
                  className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700/60"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Back to Library</span>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => togglePlayTrack(showcaseTrack)}
                    className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-95 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/30 cursor-pointer"
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isPlaying ? 'Pause' : 'Play Song'}</span>
                  </button>
                  <button
                    onClick={() => handleOpenFileInPlayer(showcaseTrack.file_path)}
                    title="Open in System Default Media Player (VLC/MPV)"
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in Audio Player</span>
                  </button>
                  <button
                    onClick={() => handleOpenFolder(showcaseTrack.folder_path)}
                    title="Open directory in file manager"
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 flex items-center gap-1.5"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Open Folder</span>
                  </button>
                </div>
              </div>

              {/* Main Split: Artwork & Info on Left, Synchronized Lyrics on Right */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start my-auto">
                
                {/* Left Side: Big Artwork & Metadata Card */}
                <div className="md:col-span-5 flex flex-col items-center text-center md:items-start md:text-left space-y-4">
                  <div className="w-72 h-72 sm:w-80 sm:h-80 rounded-2xl bg-slate-900 border border-slate-700/80 overflow-hidden shadow-2xl relative flex items-center justify-center">
                    {currentCoverUrl ? (
                      <img src={currentCoverUrl} alt={showcaseTrack.album} className="w-full h-full object-cover shadow-2xl" />
                    ) : (
                      <Music className="w-24 h-24 text-indigo-400" />
                    )}
                  </div>

                  <div className="space-y-1 w-full">
                    <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
                      {showcaseTrack.track}
                    </h1>
                    <p className="text-base text-indigo-400 font-semibold">
                      {showcaseTrack.artist}
                    </p>
                    <p className="text-xs text-slate-400 uppercase tracking-widest font-mono pt-1">
                      {showcaseTrack.album}
                    </p>

                    {/* Metadata Pills */}
                    <div className="flex items-center gap-2 pt-3 justify-center md:justify-start">
                      <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-mono text-[10px] font-bold">
                        {showcaseTrack.file_path.endsWith('.flac') ? 'FLAC' : 'MP3'}
                      </span>
                      {showcaseTrack.year && (
                        <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-mono text-[10px] font-bold">
                          {showcaseTrack.year}
                        </span>
                      )}
                      <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-mono text-[10px] font-bold">
                        {showcaseTrack.file_size_mb} MB
                      </span>
                      {showcaseTrack.has_lrc && (
                        <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono text-[10px] font-bold">
                          SYNCED LRC
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Side: Feishin Lyrics Showcase Panel */}
                <div className="md:col-span-7 bg-[#161b22]/70 backdrop-blur-xl border border-slate-800/90 rounded-3xl p-6 shadow-2xl flex flex-col h-[460px]">
                  
                  {/* Top Panel Tabs */}
                  <div className="flex items-center justify-around border-b border-slate-800/80 pb-3 mb-4 text-xs font-bold tracking-wider uppercase text-slate-400">
                    <button
                      onClick={() => setShowcaseTab('lyrics')}
                      className={`pb-1 transition-all ${
                        showcaseTab === 'lyrics'
                          ? 'text-white border-b-2 border-indigo-500'
                          : 'hover:text-slate-200'
                      }`}
                    >
                      LYRICS
                    </button>
                    <button
                      onClick={() => setShowcaseTab('details')}
                      className={`pb-1 transition-all ${
                        showcaseTab === 'details'
                          ? 'text-white border-b-2 border-indigo-500'
                          : 'hover:text-slate-200'
                      }`}
                    >
                      METADATA DETAILS
                    </button>
                    <button
                      onClick={() => setShowcaseTab('related')}
                      className={`pb-1 transition-all ${
                        showcaseTab === 'related'
                          ? 'text-white border-b-2 border-indigo-500'
                          : 'hover:text-slate-200'
                      }`}
                    >
                      FILE INFO
                    </button>
                  </div>

                  {/* Lyrics Display */}
                  {showcaseTab === 'lyrics' && (
                    <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4 text-center">
                      <p className="text-[11px] text-slate-500 font-mono mb-4">
                        Provided by LRCLIB / Embedded Synchronization
                      </p>

                      {lyricsLines.map((line, idx) => {
                        const isActive = idx === activeLyricIndex
                        return (
                          <p
                            key={idx}
                            onClick={() => setActiveLyricIndex(idx)}
                            className={`cursor-pointer transition-all duration-300 select-text ${
                              isActive
                                ? 'text-lg md:text-xl font-extrabold text-white scale-105 my-2 text-shadow'
                                : 'text-sm font-medium text-slate-400/50 hover:text-slate-200'
                            }`}
                          >
                            {line.text}
                          </p>
                        )
                      })}
                    </div>
                  )}

                  {/* Details Tab */}
                  {showcaseTab === 'details' && (
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                        <span className="text-slate-500 uppercase font-mono text-[10px]">Track MBID:</span>
                        <div className="font-mono text-slate-200 text-[11px] break-all">{showcaseTrack.mbid || 'N/A'}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                        <span className="text-slate-500 uppercase font-mono text-[10px]">Authoritative Path:</span>
                        <div className="font-mono text-slate-200 text-[11px] break-all">{showcaseTrack.folder_path}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                        <span className="text-slate-500 uppercase font-mono text-[10px]">Audio Source:</span>
                        <div className="font-mono text-emerald-400 text-[11px]">{showcaseTrack.source_used || 'yt-dlp'}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                        <span className="text-slate-500 uppercase font-mono text-[10px]">Acquired At:</span>
                        <div className="font-mono text-slate-300 text-[11px]">{showcaseTrack.downloaded_at || 'Recently'}</div>
                      </div>
                    </div>
                  )}

                  {/* Related / File Tab */}
                  {showcaseTab === 'related' && (
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                        <span className="text-slate-500 uppercase font-mono text-[10px]">Audio File:</span>
                        <div className="font-mono text-slate-200 text-[11px] break-all">{showcaseTrack.file_path}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                        <span className="text-slate-500 uppercase font-mono text-[10px]">Artwork File:</span>
                        <div className="font-mono text-slate-200 text-[11px] break-all">{showcaseTrack.cover_path || 'None'}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                        <span className="text-slate-500 uppercase font-mono text-[10px]">Lyrics File:</span>
                        <div className="font-mono text-slate-200 text-[11px] break-all">{showcaseTrack.lrc_path || 'None'}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Scrubber Indicator */}
              <div className="p-4 rounded-2xl bg-[#161b22]/90 border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-800 overflow-hidden flex items-center justify-center flex-shrink-0">
                    {currentCoverUrl ? <img src={currentCoverUrl} alt="cover" className="w-full h-full object-cover" /> : <Music className="w-5 h-5 text-indigo-400" />}
                  </div>
                  <div>
                    <div className="font-bold text-white text-xs">{showcaseTrack.track}</div>
                    <div className="text-[10px] text-slate-400">{showcaseTrack.artist} • {showcaseTrack.album}</div>
                  </div>
                </div>

                <div className="flex-1 max-w-md mx-6">
                  <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 w-1/3 rounded-full" />
                  </div>
                </div>

                <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
                  <span>{showcaseTrack.duration ? `${Math.floor(showcaseTrack.duration / 60)}:${Math.floor(showcaseTrack.duration % 60).toString().padStart(2, '0')}` : '--:--'}</span>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW 2: ALBUM / ARTIST SHOWCASE PAGE (IMAGE 2 STYLE) */}
          {/* ========================================================================= */}
          {currentNav === 'album_detail' && selectedAlbum && (
            <div className="space-y-6 max-w-5xl mx-auto animate-fadeIn">
              <button
                onClick={() => setCurrentNav('albums')}
                className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700/60"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back to Albums</span>
              </button>

              {/* Feishin Hero Banner (Image 2) */}
              <div className="p-8 rounded-3xl bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-slate-900/40 border border-slate-800/80 relative overflow-hidden flex flex-col md:flex-row items-center gap-8 shadow-2xl">
                <div className="w-48 h-48 rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden flex-shrink-0 shadow-2xl flex items-center justify-center">
                  {selectedAlbum.cover_path && coverCache[selectedAlbum.cover_path] ? (
                    <img src={coverCache[selectedAlbum.cover_path]} alt={selectedAlbum.album} className="w-full h-full object-cover" />
                  ) : (
                    <Disc className="w-20 h-20 text-indigo-400" />
                  )}
                </div>

                <div className="space-y-2 flex-1 text-center md:text-left">
                  <div className="text-[10px] font-mono tracking-widest text-indigo-400 uppercase font-bold">
                    ALBUM ARTIST
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                    {selectedAlbum.artist}
                  </h1>
                  <p className="text-base text-slate-300 font-semibold">
                    {selectedAlbum.album}
                  </p>
                  <p className="text-xs text-slate-400 font-mono pt-1">
                    {selectedAlbum.tracks.length} track(s) {selectedAlbum.year ? `• ${selectedAlbum.year}` : ''}
                  </p>

                  <div className="flex items-center gap-3 pt-4 justify-center md:justify-start">
                    <button
                      onClick={() => selectTrackForShowcase(selectedAlbum.tracks[0], true)}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      <span>View Lyrics & Showcase</span>
                    </button>
                    <button
                      onClick={() => handleOpenFolder(selectedAlbum.folder_path)}
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-2"
                    >
                      <FolderOpen className="w-4 h-4 text-emerald-400" />
                      <span>Open Folder</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Album Tracklist Table */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-white">Album Tracks</h3>
                <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900/40">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px] uppercase bg-slate-900/80">
                        <th className="py-3 px-4 w-12 text-center">#</th>
                        <th className="py-3 px-4">Title</th>
                        <th className="py-3 px-4 w-24">Duration</th>
                        <th className="py-3 px-4 w-24">Size</th>
                        <th className="py-3 px-4 w-36 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {selectedAlbum.tracks.map((trk, idx) => (
                        <tr key={idx} className="hover:bg-slate-850/60 transition-colors">
                          <td className="py-3 px-4 text-center font-mono text-slate-500">{idx + 1}</td>
                          <td className="py-3 px-4 font-bold text-white">{trk.track}</td>
                          <td className="py-3 px-4 font-mono text-slate-400">
                            {trk.duration ? `${Math.floor(trk.duration / 60)}:${Math.floor(trk.duration % 60).toString().padStart(2, '0')}` : '--:--'}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-400">{trk.file_size_mb} MB</td>
                          <td className="py-3 px-4 text-right space-x-2">
                            <button
                              onClick={() => selectTrackForShowcase(trk, true)}
                              className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded-lg text-[11px] font-semibold border border-indigo-500/40"
                            >
                              Lyrics
                            </button>
                            <button
                              onClick={() => handleOpenFileInPlayer(trk.file_path)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[11px] font-semibold border border-slate-700"
                            >
                              Play
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW 3: TRACKS LIST */}
          {/* ========================================================================= */}
          {currentNav === 'tracks' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">Tracks Library</h2>
                  <p className="text-xs text-slate-400">Showing {filteredLibrary.length} tracks in authoritative storage</p>
                </div>
                <button
                  onClick={() => setCurrentNav('install')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Acquire More</span>
                </button>
              </div>

              {filteredLibrary.length === 0 ? (
                <div className="py-20 text-center space-y-3">
                  <Music className="w-12 h-12 text-slate-700 mx-auto" />
                  <p className="text-slate-400 text-xs">No tracks recorded yet.</p>
                </div>
              ) : (
                <>
                  {/* Mobile Touch Song Cards List (Spotify / Apple Music style) */}
                  <div className="md:hidden space-y-2.5">
                    {filteredLibrary.map((track, idx) => {
                      const coverUrl = track.cover_path ? coverCache[track.cover_path] : null
                      return (
                        <div
                          key={track.id || idx}
                          onClick={() => selectTrackForShowcase(track, true)}
                          className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800/80 active:bg-slate-800 flex items-center justify-between gap-3 shadow-md active:scale-[0.99] transition-transform cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700/80 overflow-hidden flex-shrink-0 flex items-center justify-center shadow">
                              {coverUrl ? (
                                <img src={coverUrl} alt={track.album} className="w-full h-full object-cover" />
                              ) : (
                                <Music className="w-6 h-6 text-indigo-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-white text-sm truncate">{track.track}</div>
                              <div className="text-xs text-slate-400 truncate">{track.artist}</div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                                <span>{track.duration ? `${Math.floor(track.duration / 60)}:${Math.floor(track.duration % 60).toString().padStart(2, '0')}` : '--:--'}</span>
                                <span>•</span>
                                <span className="text-indigo-400 font-bold uppercase">{track.file_path.endsWith('.flac') ? 'FLAC' : 'MP3'}</span>
                                {track.has_lrc && (
                                  <>
                                    <span>•</span>
                                    <span className="text-emerald-400 font-bold">LRC</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                selectTrackForShowcase(track, true)
                              }}
                              className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 active:bg-indigo-600 active:text-white transition-all cursor-pointer"
                              title="Showcase & Lyrics"
                            >
                              <Mic2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Desktop Full Feishin Table */}
                  <div className="hidden md:block border border-slate-800/80 rounded-2xl overflow-hidden bg-slate-900/40">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px] uppercase bg-slate-900/80">
                          <th className="py-3 px-4 w-12 text-center">#</th>
                          <th className="py-3 px-4">Title & Artist</th>
                          <th className="py-3 px-4">Album</th>
                          <th className="py-3 px-4 w-24">Duration</th>
                          <th className="py-3 px-4 w-24">Size</th>
                          <th className="py-3 px-4 w-32">Badges</th>
                          <th className="py-3 px-4 w-48 text-right">Showcase & Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850">
                        {filteredLibrary.map((track, idx) => {
                          const coverUrl = track.cover_path ? coverCache[track.cover_path] : null
                          const isUnknown = track.album === 'Unknown Album'
                          return (
                            <tr key={track.id || idx} className="hover:bg-slate-850/60 transition-colors group">
                              <td className="py-3 px-4 text-center font-mono text-slate-500">{idx + 1}</td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-3">
                                  <div 
                                    onClick={() => selectTrackForShowcase(track, true)}
                                    className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 overflow-hidden flex-shrink-0 flex items-center justify-center cursor-pointer shadow-md group-hover:border-indigo-500"
                                  >
                                    {coverUrl ? (
                                      <img src={coverUrl} alt={track.album} className="w-full h-full object-cover" />
                                    ) : (
                                      <Music className="w-5 h-5 text-indigo-400" />
                                    )}
                                  </div>
                                  <div>
                                    <div 
                                      onClick={() => selectTrackForShowcase(track, true)}
                                      className="font-bold text-white text-xs truncate max-w-xs cursor-pointer hover:text-indigo-400 transition-colors"
                                    >
                                      {track.track}
                                    </div>
                                    <div className="text-[11px] text-slate-400 truncate">{track.artist}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-slate-300 truncate max-w-xs">{track.album}</td>
                              <td className="py-3 px-4 font-mono text-slate-400">
                                {track.duration ? `${Math.floor(track.duration / 60)}:${Math.floor(track.duration % 60).toString().padStart(2, '0')}` : '--:--'}
                              </td>
                              <td className="py-3 px-4 font-mono text-slate-400">{track.file_size_mb} MB</td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-1.5">
                                  {track.has_lrc && (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-mono font-bold">
                                      LRC
                                    </span>
                                  )}
                                  {isUnknown && (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-mono font-bold">
                                      NO ALBUM
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right space-x-2">
                                <button
                                  onClick={() => selectTrackForShowcase(track, true)}
                                  title="View dynamic synced lyrics"
                                  className="px-2.5 py-1.5 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded-lg text-[11px] font-medium border border-indigo-500/40 inline-flex items-center gap-1"
                                >
                                  <Mic2 className="w-3 h-3" />
                                  <span>Lyrics</span>
                                </button>
                                <button
                                  onClick={() => handleOpenFolder(track.folder_path)}
                                  title="Open exact directory in file manager"
                                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-[11px] font-medium border border-slate-700 inline-flex items-center gap-1"
                                >
                                  <FolderOpen className="w-3 h-3 text-emerald-400" />
                                  <span>Folder</span>
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW 4: ALBUMS GRID (IMAGE 2 STYLE) */}
          {/* ========================================================================= */}
          {currentNav === 'albums' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Albums ({albumsGrouped.length})</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {albumsGrouped.map((alb, idx) => {
                  const coverUrl = alb.cover_path ? coverCache[alb.cover_path] : null
                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        setSelectedAlbum(alb)
                        setCurrentNav('album_detail')
                      }}
                      className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/50 cursor-pointer transition-all flex flex-col justify-between group shadow-lg hover:shadow-indigo-500/10"
                    >
                      <div className="aspect-square rounded-xl bg-slate-800 border border-slate-700/80 overflow-hidden mb-3 relative flex items-center justify-center shadow-md">
                        {coverUrl ? (
                          <img src={coverUrl} alt={alb.album} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        ) : (
                          <Disc className="w-10 h-10 text-indigo-400" />
                        )}
                        {/* Corner Track Count Badge (Image 2 style) */}
                        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/80 text-white font-mono text-[10px] font-bold backdrop-blur-md">
                          {alb.tracks.length}
                        </div>
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-bold text-white text-xs truncate group-hover:text-indigo-400 transition-colors" title={alb.album}>{alb.album}</div>
                        <div className="text-[11px] text-slate-400 truncate">{alb.artist}</div>
                        <div className="text-[10px] text-slate-500 font-mono pt-1">
                          {alb.year || 'Album'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW 5: ARTISTS GRID */}
          {currentNav === 'artists' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white">Artists ({artistsGrouped.length})</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {artistsGrouped.map((art, idx) => {
                  const coverUrl = art.sampleCover ? coverCache[art.sampleCover] : null
                  return (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40 transition-all text-center flex flex-col items-center shadow-lg"
                    >
                      <div className="w-20 h-20 rounded-full bg-slate-800 border border-slate-700 overflow-hidden mb-3 flex items-center justify-center shadow-md">
                        {coverUrl ? (
                          <img src={coverUrl} alt={art.artist} className="w-full h-full object-cover" />
                        ) : (
                          <Users className="w-8 h-8 text-cyan-400" />
                        )}
                      </div>
                      <div className="font-bold text-white text-xs truncate w-full" title={art.artist}>{art.artist}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {art.tracksCount} track(s) • {art.albumsCount} album(s)
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW 6: OVERVIEW / DASHBOARD */}
          {currentNav === 'overview' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white">Music Vault Overview</h2>
                <p className="text-xs text-slate-400">Status of locally acquired media and synchronized metadata</p>
              </div>

              {/* Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Total Tracks</span>
                    <Music className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="text-2xl font-black text-white font-mono">{library.length}</div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Artists</span>
                    <Users className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="text-2xl font-black text-white font-mono">{artistsGrouped.length}</div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Albums</span>
                    <Disc className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="text-2xl font-black text-white font-mono">{albumsGrouped.length}</div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Total Size</span>
                    <HardDrive className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-black text-white font-mono">{totalStorageMb} MB</div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div
                  onClick={() => {
                    setCurrentNav('install')
                    setInstallTab('single')
                  }}
                  className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-indigo-500/50 cursor-pointer transition-all space-y-2 group"
                >
                  <Search className="w-6 h-6 text-indigo-400 group-hover:scale-110 transition-transform" />
                  <div className="font-bold text-white text-xs">Single Song Search</div>
                  <p className="text-[11px] text-slate-400">Search canonical recordings by track and artist name.</p>
                </div>

                <div
                  onClick={() => {
                    setCurrentNav('install')
                    setInstallTab('csv')
                  }}
                  className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-purple-500/50 cursor-pointer transition-all space-y-2 group"
                >
                  <FileSpreadsheet className="w-6 h-6 text-purple-400 group-hover:scale-110 transition-transform" />
                  <div className="font-bold text-white text-xs">Batch CSV Import</div>
                  <p className="text-[11px] text-slate-400">Import hundreds of songs from CSV file or pasted text.</p>
                </div>

                <div
                  onClick={() => {
                    setCurrentNav('install')
                    setInstallTab('playlist')
                  }}
                  className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-pink-500/50 cursor-pointer transition-all space-y-2 group"
                >
                  <Link2 className="w-6 h-6 text-pink-400 group-hover:scale-110 transition-transform" />
                  <div className="font-bold text-white text-xs">Playlist Extraction</div>
                  <p className="text-[11px] text-slate-400">Extract Spotify, YouTube, or Apple Music playlists.</p>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW 7: INSTALL / ACQUISITION VIEW */}
          {/* ========================================================================= */}
          {currentNav === 'install' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Music Acquisition Engine</h2>
                <p className="text-xs text-slate-400">
                  Acquire songs, parse playlists, or batch import CSV files directly into your structured library.
                </p>
              </div>

              {/* Install Sub-Mode Tabs & Quality Format Selector */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 p-1.5 bg-slate-900/80 rounded-2xl border border-slate-800 w-fit">
                  <button
                    onClick={() => setInstallTab('single')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                      installTab === 'single'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Song & Artist Name</span>
                  </button>

                  <button
                    onClick={() => setInstallTab('csv')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                      installTab === 'csv'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>CSV File Import</span>
                  </button>

                  <button
                    onClick={() => setInstallTab('playlist')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                      installTab === 'playlist'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Playlist Link</span>
                  </button>
                </div>

                {/* Quality Format Toggle (FLAC, MP3, WAV, M4A) */}
                <div className="flex items-center gap-1.5 p-1.5 bg-slate-900/80 rounded-2xl border border-slate-800 flex-wrap">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">Format:</span>
                  <button
                    type="button"
                    onClick={() => setAudioFormat('flac')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      audioFormat === 'flac'
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                    <span>FLAC (Lossless)</span>
                    <span className="text-[9px] bg-white/20 text-white px-1.5 py-0.2 rounded-md font-mono font-bold">SOULSEEK</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAudioFormat('mp3')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      audioFormat === 'mp3'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>MP3 (320k)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAudioFormat('wav')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      audioFormat === 'wav'
                        ? 'bg-cyan-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>WAV (PCM)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAudioFormat('m4a')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      audioFormat === 'm4a'
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>M4A (AAC)</span>
                  </button>
                </div>
              </div>

              {/* SUB-TAB 1: SONG & ARTIST NAME */}
              {installTab === 'single' && (
                <div className="space-y-5">
                  <form onSubmit={handleSingleSearch} className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4 shadow-xl">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
                          Song Title *
                        </label>
                        <input
                          type="text"
                          value={singleSong}
                          onChange={(e) => setSingleSong(e.target.value)}
                          placeholder="e.g. Creep, Despacito, At My Worst"
                          className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
                          Artist Name (Optional / Recommended)
                        </label>
                        <input
                          type="text"
                          value={singleArtist}
                          onChange={(e) => setSingleArtist(e.target.value)}
                          placeholder="e.g. Radiohead, Luis Fonsi, Pink Sweat$"
                          className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={singleSearching || !singleSong.trim()}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all"
                      >
                        {singleSearching ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Resolving Candidates...</span>
                          </>
                        ) : (
                          <>
                            <Search className="w-3.5 h-3.5" />
                            <span>SEARCH RECORDINGS</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>

                  {singleError && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <span>{singleError}</span>
                    </div>
                  )}

                  {singleResults && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-slate-400 px-1 font-medium">
                        <span>Found {singleResults.total_count} candidate recording(s)</span>
                        <span className="font-mono text-indigo-400">Mode: {singleResults.mode}</span>
                      </div>

                      <div className="space-y-2.5">
                        {singleResults.results.map((item, idx) => (
                          <div
                            key={item.id || idx}
                            className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-4 transition-all"
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              <div className="w-11 h-11 rounded-xl bg-slate-800 flex items-center justify-center flex-shrink-0">
                                <Music className="w-5 h-5 text-indigo-400" />
                              </div>
                              <div className="min-w-0 space-y-0.5">
                                <div className="font-bold text-white text-xs truncate">{item.title}</div>
                                <div className="text-xs text-slate-400 truncate">{item.artist}</div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  {item.album} • {Math.floor(item.duration_sec / 60)}:{Math.floor(item.duration_sec % 60).toString().padStart(2, '0')} • ~{item.estimated_mp3_mb} MB
                                </div>
                              </div>
                            </div>

                            <button
                              onClick={() => openDownloadModal(item)}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md flex-shrink-0"
                            >
                              <DownloadCloud className="w-3.5 h-3.5" />
                              <span>Install Track</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SUB-TAB 2: CSV FILE BATCH IMPORT */}
              {installTab === 'csv' && (
                <div className="space-y-5">
                  <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-white">Import Tracklist from CSV</h3>
                        <p className="text-xs text-slate-400">Accepts CSV or text containing "Artist, Title" or "Title, Artist"</p>
                      </div>
                      <label className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-white text-xs font-bold rounded-xl border border-slate-700 cursor-pointer flex items-center gap-2">
                        <UploadCloud className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Upload .csv File</span>
                        <input type="file" accept=".csv,.txt" onChange={handleCsvFileUpload} className="hidden" />
                      </label>
                    </div>

                    <textarea
                      value={csvText}
                      onChange={(e) => {
                        setCsvText(e.target.value)
                        parseCsvContent(e.target.value)
                      }}
                      placeholder="Or paste CSV rows here, e.g.:&#10;Radiohead, Creep&#10;Ed Sheeran, Shape of You&#10;Pink Sweat$, At My Worst"
                      rows={5}
                      className="w-full p-3.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                    />

                    {csvParsedTracks.length > 0 && (
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                          <span>Parsed {csvParsedTracks.length} song(s) ({csvSelectedIndices.length} selected)</span>
                          <div className="flex gap-2 text-[11px] text-indigo-400 font-semibold">
                            <button
                              type="button"
                              onClick={() => setCsvSelectedIndices(csvParsedTracks.map((_, i) => i))}
                              className="hover:underline"
                            >
                              Select All
                            </button>
                            <span>•</span>
                            <button
                              type="button"
                              onClick={() => setCsvSelectedIndices([])}
                              className="hover:underline"
                            >
                              Deselect All
                            </button>
                          </div>
                        </div>

                        <div className="max-h-60 overflow-y-auto border border-slate-800 rounded-xl divide-y divide-slate-850">
                          {csvParsedTracks.map((trk, idx) => {
                            const isSelected = csvSelectedIndices.includes(idx)
                            return (
                              <div
                                key={idx}
                                onClick={() => {
                                  if (isSelected) {
                                    setCsvSelectedIndices(csvSelectedIndices.filter(i => i !== idx))
                                  } else {
                                    setCsvSelectedIndices([...csvSelectedIndices, idx])
                                  }
                                }}
                                className={`px-4 py-2.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                                  isSelected ? 'bg-indigo-950/20 text-white' : 'text-slate-400 hover:bg-slate-900'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {}}
                                    className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                                  />
                                  <span className="font-bold text-slate-200">{trk.title}</span>
                                  <span className="text-slate-400">— {trk.artist}</span>
                                </div>
                                <span className="font-mono text-[10px] text-slate-500">{trk.query}</span>
                              </div>
                            )
                          })}
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          <div className="text-xs text-slate-400">
                            Destination: <span className="font-mono text-slate-300">{saveDir}/Artist/Album/</span>
                          </div>
                          <button
                            onClick={runCsvBatchDownload}
                            disabled={batchDownloading || csvSelectedIndices.length === 0}
                            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2"
                          >
                            {batchDownloading ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Processing Batch...</span>
                              </>
                            ) : (
                              <>
                                <DownloadCloud className="w-4 h-4" />
                                <span>Install {csvSelectedIndices.length} Track(s)</span>
                              </>
                            )}
                          </button>
                        </div>

                        {batchProgress && (
                          <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-900/40 space-y-2">
                            <div className="flex items-center justify-between text-xs text-indigo-300">
                              <span>{batchProgress.status}</span>
                              <span className="font-mono font-bold">{batchProgress.current} / {batchProgress.total}</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-500 transition-all duration-300"
                                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SUB-TAB 3: PLAYLIST LINK IMPORT */}
              {installTab === 'playlist' && (
                <div className="space-y-5">
                  <form onSubmit={handleFetchPlaylist} className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-white">Import from Playlist or Song Link</h3>
                      <p className="text-xs text-slate-400">Paste Spotify, YouTube Music, YouTube, Apple Music, or JioSaavn link (Playlists, Albums, or Single Songs)</p>
                    </div>

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Link2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="url"
                          value={playlistUrl}
                          onChange={(e) => setPlaylistUrl(e.target.value)}
                          placeholder="Paste Spotify, YouTube Music, Apple Music link (song or playlist)..."
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={playlistFetching || !playlistUrl.trim()}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-1.5 flex-shrink-0"
                      >
                        {playlistFetching ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Resolving...</span>
                          </>
                        ) : (
                          <span>FETCH TRACKS</span>
                        )}
                      </button>
                    </div>
                  </form>

                  {playlistError && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <span>{playlistError}</span>
                    </div>
                  )}

                  {playlistTracks.length > 0 && (
                    <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                      <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                        <span>Extracted {playlistTracks.length} song(s) ({playlistSelectedIndices.length} selected)</span>
                        <div className="flex gap-2 text-[11px] text-indigo-400 font-semibold">
                          <button
                            type="button"
                            onClick={() => setPlaylistSelectedIndices(playlistTracks.map((_, i) => i))}
                            className="hover:underline"
                          >
                            Select All
                          </button>
                          <span>•</span>
                          <button
                            type="button"
                            onClick={() => setPlaylistSelectedIndices([])}
                            className="hover:underline"
                          >
                            Deselect All
                          </button>
                        </div>
                      </div>

                      <div className="max-h-72 overflow-y-auto border border-slate-800 rounded-xl divide-y divide-slate-850">
                        {playlistTracks.map((trk, idx) => {
                          const isSelected = playlistSelectedIndices.includes(idx)
                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                if (isSelected) {
                                  setPlaylistSelectedIndices(playlistSelectedIndices.filter(i => i !== idx))
                                } else {
                                  setPlaylistSelectedIndices([...playlistSelectedIndices, idx])
                                }
                              }}
                              className={`px-4 py-2.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                                isSelected ? 'bg-indigo-950/20 text-white' : 'text-slate-400 hover:bg-slate-900'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="font-bold text-slate-200">{trk.title}</span>
                                <span className="text-slate-400">— {trk.artist}</span>
                              </div>
                              <span className="font-mono text-[10px] text-slate-500">{trk.query}</span>
                            </div>
                          )
                        })}
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <div className="text-xs text-slate-400">
                          Destination: <span className="font-mono text-slate-300">{saveDir}/Artist/Album/</span>
                        </div>
                        <button
                          onClick={runPlaylistDownload}
                          disabled={playlistDownloading || playlistSelectedIndices.length === 0}
                          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2"
                        >
                          {playlistDownloading ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Acquiring Playlist...</span>
                            </>
                          ) : (
                            <>
                              <DownloadCloud className="w-4 h-4" />
                              <span>Install {playlistSelectedIndices.length} Song(s)</span>
                            </>
                          )}
                        </button>
                      </div>

                      {playlistProgress && (
                        <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-900/40 space-y-2">
                          <div className="flex items-center justify-between text-xs text-indigo-300">
                            <span>{playlistProgress.status}</span>
                            <span className="font-mono font-bold">{playlistProgress.current} / {playlistProgress.total}</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 transition-all duration-300"
                              style={{ width: `${(playlistProgress.current / playlistProgress.total) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* --- ANDROID FLOATING NOW-PLAYING / LYRICS MINI-BAR (MOBILE ONLY) --- */}
      {showcaseTrack && currentNav !== 'showcase' && (
        <div 
          onClick={() => setCurrentNav('showcase')}
          className="md:hidden fixed bottom-16 left-3 right-3 z-30 p-2.5 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 shadow-2xl flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform animate-slideUp"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden flex-shrink-0 flex items-center justify-center shadow">
              {currentCoverUrl ? (
                <img src={currentCoverUrl} alt={showcaseTrack.title} className="w-full h-full object-cover" />
              ) : (
                <Music className="w-5 h-5 text-indigo-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">{showcaseTrack.track}</div>
              <div className="text-[10px] text-slate-400 truncate">{showcaseTrack.artist}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 pl-2 flex-shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                togglePlayTrack(showcaseTrack)
              }}
              className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <div className="px-2.5 py-1.5 rounded-xl bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-[10px] font-bold flex items-center gap-1">
              <Mic2 className="w-3 h-3" />
              <span>Lyrics</span>
            </div>
          </div>
        </div>
      )}

      {/* --- ANDROID NATIVE BOTTOM NAVIGATION BAR (MOBILE ONLY) --- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0d1117]/95 backdrop-blur-2xl border-t border-slate-800/90 px-2 py-1.5 flex items-center justify-around pb-[max(0.6rem,env(safe-area-inset-bottom))] shadow-2xl">
        <button
          type="button"
          onClick={() => setCurrentNav('overview')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-all cursor-pointer ${
            currentNav === 'overview'
              ? 'text-indigo-400 font-bold scale-105'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px]">Home</span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentNav('tracks')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-all cursor-pointer ${
            currentNav === 'tracks'
              ? 'text-pink-400 font-bold scale-105'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Music className="w-5 h-5" />
          <span className="text-[10px]">Tracks</span>
        </button>

        {/* Central Prominent Downloader / Search Button */}
        <button
          type="button"
          onClick={() => {
            setCurrentNav('install')
            setInstallTab('single')
          }}
          className={`flex flex-col items-center gap-0.5 py-1 px-3.5 rounded-2xl transition-all -translate-y-2 shadow-lg cursor-pointer ${
            currentNav === 'install'
              ? 'bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-indigo-600/50 ring-2 ring-indigo-400'
              : 'bg-slate-800 text-indigo-300 border border-indigo-500/40 shadow-black/50'
          }`}
        >
          <DownloadCloud className="w-5 h-5" />
          <span className="text-[9px] font-extrabold uppercase tracking-wider">Search</span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentNav('albums')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-all cursor-pointer ${
            currentNav === 'albums' || currentNav === 'album_detail'
              ? 'text-purple-400 font-bold scale-105'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Disc className="w-5 h-5" />
          <span className="text-[10px]">Albums</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (showcaseTrack) {
              setCurrentNav('showcase')
            } else if (library.length > 0) {
              selectTrackForShowcase(library[0], true)
            } else {
              setCurrentNav('artists')
            }
          }}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-all cursor-pointer ${
            currentNav === 'showcase'
              ? 'text-cyan-400 font-bold scale-105'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Mic2 className="w-5 h-5" />
          <span className="text-[10px]">Lyrics</span>
        </button>
      </nav>

      {/* --- CONFIRMATION MODAL --- */}
      {promptTrack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Confirm Installation</h3>
                <p className="text-xs text-slate-400">Confirm target folder and metadata options</p>
              </div>
              <button
                onClick={() => !downloading && setPromptTrack(null)}
                disabled={downloading}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="font-bold text-white text-sm">{promptTrack.title}</div>
              <div className="text-xs text-indigo-400 font-medium">{promptTrack.artist}</div>
              <div className="text-[11px] text-slate-400">
                Album: <span className="text-slate-200">{promptOverrideAlbum ? 'Unknown Album' : promptTrack.album}</span>
              </div>
            </div>

            {/* Audio Quality & Format Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">
                Audio Quality & Encoding:
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div
                  onClick={() => !downloading && setAudioFormat('flac')}
                  className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                    audioFormat === 'flac'
                      ? 'bg-emerald-950/40 border-emerald-500 text-white shadow-lg shadow-emerald-950/40 ring-1 ring-emerald-500'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-xs text-white">FLAC Lossless</span>
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      SOULSEEK
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Bit-perfect audiophile quality via Sockseek P2P network.
                  </p>
                </div>

                <div
                  onClick={() => !downloading && setAudioFormat('mp3')}
                  className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                    audioFormat === 'mp3'
                      ? 'bg-indigo-950/40 border-indigo-500 text-white shadow-lg shadow-indigo-950/40 ring-1 ring-indigo-500'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-xs text-white">MP3 (320k)</span>
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                      COMPACT
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    High-bitrate universal compatibility & smaller file size.
                  </p>
                </div>

                <div
                  onClick={() => !downloading && setAudioFormat('wav')}
                  className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                    audioFormat === 'wav'
                      ? 'bg-cyan-950/40 border-cyan-500 text-white shadow-lg shadow-cyan-950/40 ring-1 ring-cyan-500'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-xs text-white">WAV PCM</span>
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                      STUDIO
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Raw uncompressed lossless audio stream.
                  </p>
                </div>

                <div
                  onClick={() => !downloading && setAudioFormat('m4a')}
                  className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                    audioFormat === 'm4a'
                      ? 'bg-purple-950/40 border-purple-500 text-white shadow-lg shadow-purple-950/40 ring-1 ring-purple-500'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-xs text-white">M4A (AAC)</span>
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                      APPLE
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    High efficiency 256kbps AAC audio.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <span>Save Destination:</span>
                <button
                  type="button"
                  onClick={handleBrowseFolder}
                  disabled={downloading}
                  className="text-indigo-400 hover:underline text-[11px]"
                >
                  Browse Folder...
                </button>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 break-all">
                {saveDir}
              </div>
              <div className="p-2 rounded-xl bg-indigo-950/20 border border-indigo-900/30 text-[11px] text-indigo-300 font-mono flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                <span className="truncate">
                  Path: {saveDir}/{promptTrack.artist}/{promptOverrideAlbum ? 'Unknown Album' : (promptTrack.album || 'Unknown Album')}/
                </span>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400">
              <input
                type="checkbox"
                checked={promptOverrideAlbum}
                onChange={(e) => setPromptOverrideAlbum(e.target.checked)}
                disabled={downloading}
                className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
              />
              <span>Simulate Missing Album ('Unknown Album' fallback)</span>
            </label>

            {downloadStatus && (
              <div className="p-3 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-300 text-xs flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-400 flex-shrink-0" />
                <span>{downloadStatus}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPromptTrack(null)}
                disabled={downloading}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSingleDownload}
                disabled={downloading}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-indigo-600/30"
              >
                {downloading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Downloading...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirm & Download</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- FIRST-RUN ONBOARDING & STORAGE PERMISSION MODAL --- */}
      {showOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-md bg-slate-900 border border-indigo-500/30 rounded-3xl p-7 shadow-2xl space-y-6 text-center ring-1 ring-white/10">
            <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-indigo-500/30">
              <Sparkles className="w-8 h-8 text-white" />
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                Welcome to SheroFetch
              </span>
              <h2 className="text-xl font-extrabold text-white tracking-tight mt-1">
                Enable Music Library Access
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                To acquire studio-grade music and synchronized lyrics directly into your device storage, please grant library permissions.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 text-left space-y-3">
              <div className="flex items-start gap-3">
                <Music className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-slate-300">
                  <span className="font-bold text-white">Direct Storage:</span> Saves FLAC & MP3s straight into your <code className="text-indigo-400 text-[11px]">Music/SheroFetch</code> folder.
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mic2 className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-slate-300">
                  <span className="font-bold text-white">Dynamic Lyrics:</span> Real-time synced <code className="text-indigo-400 text-[11px]">.lrc</code> lyrics for the ambient player.
                </div>
              </div>
              <div className="flex items-start gap-3">
                <HardDrive className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-slate-300">
                  <span className="font-bold text-white">100% Offline & Private:</span> No data tracking. All media stays on your local device.
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleGrantPermissions}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:opacity-95 text-white text-xs font-extrabold rounded-2xl shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Grant Storage Access & Get Started</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  try { localStorage.setItem('sherofetch_onboarded', 'true') } catch {}
                  setShowOnboarding(false)
                }}
                className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
              >
                Dismiss & setup later in Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SOULSEEK / SOCKSEEK AUTH & PROFILE MODAL POPUP --- */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-md p-6 rounded-3xl bg-[#0f172a] border border-slate-700/80 shadow-2xl relative overflow-hidden space-y-5">
            {/* Top Close Button */}
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-600/30 flex-shrink-0">
                <Radio className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <span>Soulseek P2P Network</span>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    SOCKSEEK
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  {soulseekProfile.logged_in
                    ? 'Connected P2P Profile & Sharing Status'
                    : 'Sign in to access lossless FLAC & master rips'}
                </p>
              </div>
            </div>

            {/* Notification messages */}
            {authMsg && (
              <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                authMsg.type === 'error'
                  ? 'bg-rose-950/50 border border-rose-800/80 text-rose-300'
                  : 'bg-emerald-950/50 border border-emerald-800/80 text-emerald-300'
              }`}>
                {authMsg.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>{authMsg.text}</span>
              </div>
            )}

            {/* VIEW A: IF LOGGED IN -> PROFILE DASHBOARD */}
            {soulseekProfile.logged_in ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Account Username:</span>
                    <span className="text-xs font-bold text-white font-mono flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-emerald-400" />
                      {soulseekProfile.username}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Connection Status:</span>
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      {soulseekProfile.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Default Priority:</span>
                    <span className="text-xs font-mono font-bold text-teal-300">
                      FLAC Lossless (Bit-perfect)
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Configuration:</span>
                    <span className="text-[10px] font-mono text-slate-400 truncate max-w-[180px]">
                      {soulseekProfile.config_path}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/60 text-[11px] text-slate-400 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span>
                    Your Soulseek account is authenticated and active. High-priority search queues and direct FLAC peer downloads are enabled.
                  </span>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSoulseekProfile(prev => ({ ...prev, logged_in: false }))
                    }}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    Switch Account
                  </button>
                  <button
                    type="button"
                    onClick={handleSoulseekLogout}
                    disabled={authLoading}
                    className="px-4 py-2.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            ) : (
              /* VIEW B: SIGN IN FORM */
              <form onSubmit={handleSoulseekLogin} className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Soulseek Username *
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={authUsername}
                        onChange={(e) => setAuthUsername(e.target.value)}
                        placeholder="Enter your Soulseek username"
                        required
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Password (Optional for public nodes)
                    </label>
                    <div className="relative">
                      <Key className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        placeholder="Enter your Soulseek password"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      SheroFetch Server Host (PC Engine)
                    </label>
                    <div className="relative">
                      <Radio className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={serverHostUrl}
                        onChange={(e) => setServerHostUrl(e.target.value)}
                        placeholder="http://172.16.79.114:5050"
                        className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-mono text-[11px]"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Connects your Android device to your computer's Soulseek P2P & Lossless FLAC engine.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                  <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Why connect Soulseek?</span>
                  </div>
                  <p>
                    Connecting lets you bypass lossy web rips to download genuine 16-bit / 24-bit studio FLAC files directly from the global audiophile sharing mesh.
                  </p>
                </div>

                <div className="space-y-2 pt-1">
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-95 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    {authLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    <span>Sign In & Connect Node</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsAuthModalOpen(false)}
                    className="w-full py-2.5 text-[11px] text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Continue as Guest (YouTube / Web Fallback)
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
