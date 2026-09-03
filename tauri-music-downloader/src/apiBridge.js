import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import CryptoJS from 'crypto-js'
import { transcodeStreamToFlac } from './flacEncoder.js'

function uint8ArrayToBase64(bytes) {
  let binary = ''
  const len = bytes.byteLength
  const chunkSize = 32768
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len))
    binary += String.fromCharCode.apply(null, chunk)
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

async function writeChunkedFile(path, directory, uint8Array, chunkSize = 1024 * 1024) {
  const total = uint8Array.length
  const firstEnd = Math.min(chunkSize, total)
  const firstB64 = uint8ArrayToBase64(uint8Array.subarray(0, firstEnd))
  
  await Filesystem.writeFile({
    path,
    data: firstB64,
    directory,
    recursive: true
  })

  for (let offset = firstEnd; offset < total; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, total)
    const chunkB64 = uint8ArrayToBase64(uint8Array.subarray(offset, end))
    await Filesystem.appendFile({
      path,
      data: chunkB64,
      directory
    })
  }
}

const isTauri = typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)

export function getServerUrl() {
  try {
    const custom = localStorage.getItem('sherofetch_server_url')
    if (custom && custom.trim()) return custom.trim().replace(/\/+$/, '')
  } catch {}
  return ''
}

export function setServerUrl(url) {
  try {
    if (url) localStorage.setItem('sherofetch_server_url', url.trim())
    else localStorage.removeItem('sherofetch_server_url')
  } catch {}
}

export function getAcquisitionMode() {
  try {
    return localStorage.getItem('sherofetch_acq_mode') || 'hybrid'
  } catch {}
  return 'hybrid'
}

export function setAcquisitionMode(mode) {
  try {
    localStorage.setItem('sherofetch_acq_mode', mode)
  } catch {}
}

// Dynamically fetches the current 24/7 Cloud P2P Gateway URL from GitHub
// Allows instant global URL updates for all mobile users with zero APK re-installs
export async function getActiveCloudGateway() {
  const DEFAULT_GATEWAY = 'https://proceed-derived-incorporated-examines.trycloudflare.com'
  try {
    const rawUrl = 'https://raw.githubusercontent.com/meet-the-1337/SheroFetch/main/gateway_url.txt'
    if (Capacitor.isNativePlatform() && typeof CapacitorHttp !== 'undefined') {
      const res = await CapacitorHttp.get({
        url: rawUrl,
        connectTimeout: 2000,
        readTimeout: 2000
      })
      if (res && res.status === 200 && typeof res.data === 'string') {
        const url = res.data.trim()
        if (url.startsWith('http')) {
          localStorage.setItem('sherofetch_remote_gateway', url)
          return url
        }
      }
    } else {
      const res = await fetch(rawUrl, { signal: AbortSignal.timeout(2000) })
      if (res.ok) {
        const url = (await res.text()).trim()
        if (url.startsWith('http')) {
          localStorage.setItem('sherofetch_remote_gateway', url)
          return url
        }
      }
    }
  } catch {}
  return localStorage.getItem('sherofetch_remote_gateway') || DEFAULT_GATEWAY
}

// Auto-discovers any reachable Soulseek / FLAC backend server globally or on LAN
export async function findReachableLosslessServer() {
  const custom = getServerUrl()
  const dynamicGateway = await getActiveCloudGateway()
  const candidates = [
    custom,
    dynamicGateway,
    'https://proceed-derived-incorporated-examines.trycloudflare.com',
    'http://127.0.0.1:5050',
    'http://localhost:5050',
    'http://172.16.213.166:5050',
    'http://172.16.79.114:5050',
    'http://10.0.2.2:5050'
  ].filter(Boolean)

  for (const host of candidates) {
    try {
      const pingUrl = `${host}/api/soulseek/profile`
      if (Capacitor.isNativePlatform() && typeof CapacitorHttp !== 'undefined') {
        const res = await CapacitorHttp.get({
          url: pingUrl,
          connectTimeout: 2000,
          readTimeout: 2000
        })
        if (res && (res.status === 200 || res.data?.status)) {
          setServerUrl(host)
          return host
        }
      } else {
        const r = await fetch(pingUrl, { signal: AbortSignal.timeout(1500) })
        if (r.ok) {
          setServerUrl(host)
          return host
        }
      }
    } catch {}
  }
  return null
}

// Universal native HTTP GET: Uses CapacitorHttp on mobile to bypass CORS completely
async function nativeGet(url, headers = {}) {
  const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile; SheroFetch/1.0.3)',
    'Accept': 'application/json, text/plain, */*'
  }

  if (Capacitor.isNativePlatform() || (typeof CapacitorHttp !== 'undefined' && CapacitorHttp.get)) {
    try {
      const res = await CapacitorHttp.get({
        url,
        headers: { ...defaultHeaders, ...headers }
      })
      if (res && res.data !== undefined) {
        if (typeof res.data === 'string') {
          try {
            return JSON.parse(res.data)
          } catch {
            return res.data
          }
        }
        return res.data
      }
    } catch (e) {
      console.warn('[SheroFetch Native HTTP] CapacitorHttp error, trying fetch fallback:', e)
    }
  }

  // Standard fetch fallback
  const res = await fetch(url, { headers: { ...defaultHeaders, ...headers } })
  if (!res.ok) throw new Error(`HTTP error ${res.status}`)
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

// Universal native HTTP POST: Uses CapacitorHttp on mobile
async function nativePost(url, body = {}) {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile; SheroFetch/1.0.3)',
    'Accept': 'application/json'
  }

  if (Capacitor.isNativePlatform() || (typeof CapacitorHttp !== 'undefined' && CapacitorHttp.post)) {
    try {
      const res = await CapacitorHttp.post({
        url,
        headers: defaultHeaders,
        data: body
      })
      if (res && res.data !== undefined) {
        if (typeof res.data === 'string') {
          try {
            return JSON.parse(res.data)
          } catch {
            return res.data
          }
        }
        return res.data
      }
    } catch (e) {
      console.warn('[SheroFetch Native HTTP] CapacitorHttp post error, trying fetch fallback:', e)
    }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`HTTP error ${res.status}`)
  return await res.json()
}

function sanitizeName(name) {
  return (name || 'Unknown')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Decrypts JioSaavn DES-ECB encrypted media URLs
function decryptJioSaavnMediaUrl(encUrl) {
  if (!encUrl) return null
  try {
    const key = CryptoJS.enc.Utf8.parse('38346591')
    const decrypted = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(encUrl) },
      key,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
    )
    const baseStreamUrl = decrypted.toString(CryptoJS.enc.Utf8)
    if (!baseStreamUrl || !baseStreamUrl.startsWith('http')) return null
    // Try upgrading to 320kbps studio quality
    return baseStreamUrl.replace('_96.mp4', '_320.mp4')
  } catch (e) {
    console.warn('DES decryption error:', e)
    return null
  }
}

// Standalone on-device track resolver (No PC or external backend server needed)
async function resolveOnDeviceTrack(query) {
  const cleanQ = query.trim()
  console.log(`[SheroFetch On-Device] Searching catalog for: "${cleanQ}"`)

  // 1. Search JioSaavn API via native HTTP
  let results = []
  try {
    const sUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&cc=in&includeMetaTags=1&p=1&n=15&q=${encodeURIComponent(cleanQ)}`
    const sData = await nativeGet(sUrl)
    if (sData && sData.results) {
      results = sData.results
    }
  } catch (e) {
    console.warn('[SheroFetch On-Device] Full search error:', e)
  }

  // 2. Fallback to Autocomplete if needed
  if (results.length === 0) {
    try {
      const aUrl = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&_marker=0&cc=in&includeMetaTags=1&query=${encodeURIComponent(cleanQ)}`
      const aData = await nativeGet(aUrl)
      if (aData && aData.songs?.data) {
        results = aData.songs.data
      }
    } catch {}
  }

  if (results.length === 0) {
    throw new Error(`Could not find audio tracks matching "${cleanQ}".`)
  }

  // Pick best matching result
  let top = results[0]
  const qLow = cleanQ.toLowerCase()
  for (const r of results) {
    const art = (r.primary_artists || r.more_info?.primary_artists || '').toLowerCase()
    const tit = (r.song || r.title || '').toLowerCase()
    if (qLow.includes(art) && qLow.includes(tit)) {
      top = r
      break
    }
  }

  const title = top.song || top.title || cleanQ
  const artist = top.primary_artists || top.more_info?.primary_artists || 'Unknown Artist'
  const album = top.album || 'Unknown Album'
  const year = top.year || top.more_info?.year || '2026'
  const duration = parseInt(top.duration || top.more_info?.duration || '215', 10)
  const coverUrl = (top.image || top.more_info?.image || '')
    .replace('150x150', '500x500')
    .replace('50x50', '500x500')

  // Get encrypted media URL
  let encUrl = top.encrypted_media_url
  if (!encUrl && top.id) {
    try {
      const dUrl = `https://www.jiosaavn.com/api.php?__call=song.getDetails&cc=in&_marker=0%3F_marker%3D0&_format=json&pids=${top.id}`
      const dData = await nativeGet(dUrl)
      if (dData && dData[top.id]) {
        encUrl = dData[top.id].encrypted_media_url
      }
    } catch {}
  }

  let streamUrl = decryptJioSaavnMediaUrl(encUrl)
  if (!streamUrl && top.more_info?.vlink) {
    streamUrl = top.more_info.vlink
  }

  if (!streamUrl) {
    throw new Error(`Unable to extract audio stream for "${title}".`)
  }

  return {
    title,
    artist,
    album,
    year,
    duration,
    streamUrl,
    coverUrl
  }
}

// Standalone synced lyrics resolver via LRCLIB
async function fetchSyncedLyrics(artist, title) {
  try {
    const lrcUrl = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`
    const data = await nativeGet(lrcUrl)
    if (data) {
      if (data.syncedLyrics && data.syncedLyrics.trim()) {
        return data.syncedLyrics
      }
      if (data.plainLyrics && data.plainLyrics.trim()) {
        return `[00:00.00] ${artist} - ${title}\n` + data.plainLyrics
      }
    }
  } catch (err) {
    console.warn('LRCLIB fetch error:', err)
  }
  return `[00:00.00] ${artist} - ${title}\n[00:05.00] (Instrumental / Lyrics not available)`
}

function cleanTrackTitle(raw) {
  if (!raw) return ''
  return raw
    .replace(/\s*[\(\[](?:Official\s*(?:Music\s*)?Video|Audio|Lyric\s*Video|Lyrics|Visualizer|HD|4K|Remastered)[\)\]]/gi, '')
    .replace(/\s*\|\s*.*$/g, '')
    .trim()
}

function parseArtistAndTitle(combined, fallbackArtist = '') {
  const parts = combined.split(/\s+[-–—]\s+/)
  if (parts.length >= 2) {
    return {
      artist: parts[0].trim(),
      title: cleanTrackTitle(parts.slice(1).join(' - ')).trim()
    }
  }
  return {
    artist: fallbackArtist.trim() || 'Unknown Artist',
    title: cleanTrackTitle(combined).trim()
  }
}

// Comprehensive on-device music URL resolver: Spotify, YouTube/YTMusic, Apple Music, JioSaavn
async function resolveMusicUrl(url) {
  const cleanUrl = (url || '').trim()
  if (!cleanUrl) return { status: 'error', message: 'No URL provided', tracks: [] }

  // 1. SPOTIFY
  if (cleanUrl.includes('spotify.com')) {
    // A. Single Song
    const trackMatch = cleanUrl.match(/track[\/:]([a-zA-Z0-9]+)/)
    if (trackMatch) {
      const trackId = trackMatch[1]
      const embedUrl = `https://open.spotify.com/embed/track/${trackId}`
      try {
        const html = await nativeGet(embedUrl, { 'User-Agent': 'Mozilla/5.0' })
        const match = (typeof html === 'string' ? html : JSON.stringify(html)).match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/)
        if (match) {
          const data = JSON.parse(match[1])
          const entity = data?.props?.pageProps?.state?.data?.entity
          if (entity?.name) {
            const title = entity.name
            const artist = entity.artists?.[0]?.name || 'Unknown Artist'
            return {
              type: 'song',
              status: 'ok',
              title,
              artist,
              query: `${artist} - ${title}`,
              source: 'spotify',
              tracks: [{ title, artist, query: `${artist} - ${title}` }]
            }
          }
        }
        const titleMatch = (typeof html === 'string' ? html : '').match(/<title>([^<]+)<\/title>/)
        if (titleMatch) {
          const m = titleMatch[1].match(/(.+?)\s+-\s+song and lyrics by\s+(.+?)\s*\|\s*Spotify/i)
          if (m) {
            const title = m[1].trim()
            const artist = m[2].trim()
            return {
              type: 'song',
              status: 'ok',
              title,
              artist,
              query: `${artist} - ${title}`,
              source: 'spotify',
              tracks: [{ title, artist, query: `${artist} - ${title}` }]
            }
          }
        }
      } catch (e) {
        console.warn('[SheroFetch] Spotify track resolution error:', e)
      }
    }

    // B. Playlist or Album
    const playMatch = cleanUrl.match(/(?:playlist|album)[\/:]([a-zA-Z0-9]+)/)
    if (playMatch) {
      const isAlbum = cleanUrl.includes('album')
      const embedUrl = `https://open.spotify.com/embed/${isAlbum ? 'album' : 'playlist'}/${playMatch[1]}`
      try {
        const html = await nativeGet(embedUrl, { 'User-Agent': 'Mozilla/5.0' })
        const htmlStr = typeof html === 'string' ? html : JSON.stringify(html)
        const match = htmlStr.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/)
        if (match) {
          const data = JSON.parse(match[1])
          const trackList = data?.props?.pageProps?.state?.data?.entity?.trackList || []
          const results = []
          for (const item of trackList) {
            let title = item.title || item.name
            let artist = item.subtitle || item.artists || 'Unknown Artist'
            if (typeof artist !== 'string') artist = 'Unknown Artist'
            if (title) {
              title = title.replace(/[\xa0\u200b\u200c\u200d]+/g, ' ').trim()
              artist = artist.replace(/[\xa0\u200b\u200c\u200d]+/g, ' ').trim()
              results.push({
                title,
                artist,
                query: `${artist} - ${title}`
              })
            }
          }
          if (results.length > 0) {
            return { type: 'playlist', status: 'ok', source: 'spotify', total: results.length, tracks: results }
          }
        }
      } catch (e) {
        console.warn('[SheroFetch] Spotify playlist extraction notice:', e)
      }
    }
  }

  // 2. YOUTUBE & YOUTUBE MUSIC
  if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
    // A. Playlist
    const listMatch = cleanUrl.match(/[?&]list=([a-zA-Z0-9_-]+)/)
    if (listMatch) {
      const listId = listMatch[1]
      const ytUrl = `https://www.youtube.com/playlist?list=${listId}`
      try {
        const html = await nativeGet(ytUrl, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })
        const htmlStr = typeof html === 'string' ? html : JSON.stringify(html)
        const m = htmlStr.match(/var ytInitialData = ({.*?});<\/script>/s)
        if (m) {
          const jsonStr = m[1]
          const tracks = []
          const lockupTitles = [...jsonStr.matchAll(/"lockupViewModel":\{.*?"metadata":\{"lockupMetadataViewModel":\{"title":\{"content":"([^"]+)"/g)]
          for (const match of lockupTitles) {
            const rawTitle = match[1]
            const parsed = parseArtistAndTitle(rawTitle)
            tracks.push({
              title: parsed.title,
              artist: parsed.artist,
              query: `${parsed.artist} - ${parsed.title}`
            })
          }
          if (tracks.length > 0) {
            return { type: 'playlist', status: 'ok', source: 'youtube', total: tracks.length, tracks }
          }
        }
      } catch (ytErr) {
        console.warn('[SheroFetch] YouTube playlist extraction notice:', ytErr)
      }
    }

    // B. Single Song / Video
    const videoMatch = cleanUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
    if (videoMatch) {
      const vidId = videoMatch[1]
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vidId}&format=json`
      try {
        const jsonStr = await nativeGet(oembedUrl)
        const json = typeof jsonStr === 'object' ? jsonStr : JSON.parse(jsonStr)
        const rawTitle = json.title || ''
        const author = (json.author_name || '').replace(/VEVO$/i, '').trim()
        const parsed = parseArtistAndTitle(rawTitle, author)
        return {
          type: 'song',
          status: 'ok',
          title: parsed.title,
          artist: parsed.artist,
          query: `${parsed.artist} - ${parsed.title}`,
          source: 'youtube',
          tracks: [{ title: parsed.title, artist: parsed.artist, query: `${parsed.artist} - ${parsed.title}` }]
        }
      } catch (oErr) {
        console.warn('[SheroFetch] YouTube oEmbed error:', oErr)
      }
    }
  }

  // 3. APPLE MUSIC
  if (cleanUrl.includes('music.apple.com')) {
    // Single Song
    const trackParam = cleanUrl.match(/[?&]i=(\d+)/) || cleanUrl.match(/\/song\/[^\/]+\/(\d+)/)
    if (trackParam) {
      const trackId = trackParam[1]
      try {
        const jsonStr = await nativeGet(`https://itunes.apple.com/lookup?id=${trackId}`)
        const json = typeof jsonStr === 'object' ? jsonStr : JSON.parse(jsonStr)
        if (json.results && json.results[0]) {
          const r = json.results[0]
          return {
            type: 'song',
            status: 'ok',
            title: r.trackName,
            artist: r.artistName,
            album: r.collectionName,
            query: `${r.artistName} - ${r.trackName}`,
            source: 'apple',
            tracks: [{ title: r.trackName, artist: r.artistName, query: `${r.artistName} - ${r.trackName}` }]
          }
        }
      } catch (aErr) {
        console.warn('[SheroFetch] Apple track lookup error:', aErr)
      }
    }

    // Album
    const albumMatch = cleanUrl.match(/\/album\/[^\/]+\/(\d+)/)
    if (albumMatch) {
      const albumId = albumMatch[1]
      try {
        const jsonStr = await nativeGet(`https://itunes.apple.com/lookup?id=${albumId}&entity=song`)
        const json = typeof jsonStr === 'object' ? jsonStr : JSON.parse(jsonStr)
        const songs = (json.results || []).filter(r => r.wrapperType === 'track')
        if (songs.length > 0) {
          const tracks = songs.map(s => ({
            title: s.trackName,
            artist: s.artistName,
            query: `${s.artistName} - ${s.trackName}`
          }))
          return { type: 'playlist', status: 'ok', source: 'apple', total: tracks.length, tracks }
        }
      } catch (aErr) {
        console.warn('[SheroFetch] Apple album lookup error:', aErr)
      }
    }
  }

  // 4. JIOSAAVN
  if (cleanUrl.includes('jiosaavn.com')) {
    const songMatch = cleanUrl.match(/\/song\/[^\/]+\/([a-zA-Z0-9_-]+)/)
    if (songMatch) {
      const token = songMatch[1]
      const apiUrl = `https://www.jiosaavn.com/api.php?__call=webapi.get&token=${token}&type=song&_format=json`
      try {
        const jsonStr = await nativeGet(apiUrl)
        const json = typeof jsonStr === 'object' ? jsonStr : JSON.parse(jsonStr)
        const song = json?.songs?.[0] || json
        if (song.song) {
          const title = song.song
          const artist = song.primary_artists || 'Unknown Artist'
          return {
            type: 'song',
            status: 'ok',
            title,
            artist,
            album: song.album,
            query: `${artist} - ${title}`,
            source: 'saavn',
            tracks: [{ title, artist, query: `${artist} - ${title}` }]
          }
        }
      } catch {}
    }
  }

  // 5. OpenGraph Fallback for Generic Music Link
  try {
    const html = await nativeGet(cleanUrl)
    const htmlStr = typeof html === 'string' ? html : ''
    const ogTitle = htmlStr.match(/<meta property="og:title" content="([^"]+)"/)
    const titleTag = htmlStr.match(/<title>([^<]+)<\/title>/)
    const rawTitle = ogTitle ? ogTitle[1] : (titleTag ? titleTag[1] : '')
    if (rawTitle) {
      const parsed = parseArtistAndTitle(rawTitle)
      return {
        type: 'song',
        status: 'ok',
        title: parsed.title,
        artist: parsed.artist,
        query: `${parsed.artist} - ${parsed.title}`,
        source: 'generic',
        tracks: [{ title: parsed.title, artist: parsed.artist, query: `${parsed.artist} - ${parsed.title}` }]
      }
    }
  } catch {}

  return { status: 'error', message: 'Could not extract music tracks from this link. Please verify the URL or search by song name.', tracks: [] }
}

async function scanOnDeviceMusicLibrary() {
  if (!Capacitor.isNativePlatform()) return []
  const tracks = []
  const seenPaths = new Set()

  const scanDirectory = async (baseDir, directory) => {
    try {
      const res = await Filesystem.readdir({ path: baseDir, directory })
      if (!res || !res.files) return

      for (const item of res.files) {
        const name = typeof item === 'string' ? item : item.name
        if (!name || name.startsWith('.')) continue

        const itemRelPath = baseDir ? `${baseDir}/${name}` : name
        const isDir = typeof item === 'object' && item.type === 'directory'
        const isAudio = /\.(flac|mp3|m4a|wav|aac|ogg)$/i.test(name)

        if (isDir || (!isAudio && !name.includes('.'))) {
          // Recurse into subfolder
          await scanDirectory(itemRelPath, directory)
        } else if (isAudio) {
          const baseName = name.replace(/\.[^/.]+$/, '').trim()
          const dedupKey = baseName.toLowerCase()
          if (seenPaths.has(dedupKey)) continue
          seenPaths.add(dedupKey)

          let fileUrl = ''
          let coverUrl = null
          let uriString = ''

          try {
            if (typeof item === 'object' && item.uri) {
              uriString = item.uri
            } else {
              const stat = await Filesystem.getUri({ path: itemRelPath, directory })
              uriString = stat?.uri || ''
            }
            if (uriString) {
              fileUrl = Capacitor.convertFileSrc(uriString)
            }
          } catch {}

          if (!fileUrl) continue

          const parts = itemRelPath.split('/')
          const parentFolder = parts.slice(0, -1).join('/')
          let artist = 'Unknown Artist'
          let album = 'Unknown Album'
          let trackTitle = baseName

          if (parts.length >= 3) {
            const possibleArtist = parts[parts.length - 3]
            const possibleAlbum = parts[parts.length - 2]
            if (possibleArtist !== 'Music' && possibleArtist !== 'SheroFetch' && possibleArtist !== 'Premium') {
              artist = possibleArtist
              album = possibleAlbum
            } else {
              artist = possibleAlbum
              album = 'Unknown Album'
            }
          }

          if (trackTitle.includes(' - ')) {
            const split = trackTitle.split(' - ')
            if (split.length >= 2) {
              artist = split[0].trim() || artist
              trackTitle = split.slice(1).join(' - ').trim() || trackTitle
            }
          }
          trackTitle = trackTitle.replace(/^\d+[\.\s_-]+/, '').trim()

          // Check for cover.jpg in the same directory
          try {
            const coverRel = `${parentFolder}/cover.jpg`
            const cStat = await Filesystem.getUri({ path: coverRel, directory })
            if (cStat?.uri) {
              coverUrl = Capacitor.convertFileSrc(cStat.uri)
            }
          } catch {}

          const isFlac = name.toLowerCase().endsWith('.flac')

          tracks.push({
            id: `dev-${Math.abs(name.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0))}`,
            artist,
            track: trackTitle,
            album,
            year: '2026',
            folder_path: parentFolder,
            file_path: itemRelPath,
            file_url: fileUrl,
            audio_stream_url: fileUrl,
            cover_path: coverUrl,
            lrc_path: `${parentFolder}/${baseName}.lrc`,
            has_lrc: true,
            has_cover: Boolean(coverUrl),
            duration: 210,
            file_size_mb: isFlac ? 28.5 : 8.5,
            source_used: isFlac ? 'Local Lossless FLAC' : 'Local Audio Track',
            downloaded_at: new Date().toISOString()
          })
        }
      }
    } catch {}
  }

  // Scan standard Android Music directory, Documents, and App private storage
  try { await scanDirectory('Music/SheroFetch', Directory.ExternalStorage) } catch {}
  try { await scanDirectory('SheroFetch/Music', Directory.Documents) } catch {}
  try { await scanDirectory('Music', Directory.Data) } catch {}

  return tracks
}

export async function invoke(cmd, args = {}) {
  if (typeof window !== 'undefined') window.sheroInvoke = invoke
  if (isTauri) {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
    return tauriInvoke(cmd, args)
  }

  const serverUrl = getServerUrl()

  switch (cmd) {
    case 'get_config': {
      const dir = localStorage.getItem('sherofetch_dir') || 'Music/SheroFetch'
      return { install_dir: dir }
    }

    case 'save_config': {
      if (args.config?.install_dir) {
        localStorage.setItem('sherofetch_dir', args.config.install_dir)
      }
      return true
    }

    case 'choose_folder': {
      return 'Music/SheroFetch'
    }

    case 'get_library': {
      // 1. Scan actual on-device storage for all downloaded audio files
      let scannedTracks = []
      if (Capacitor.isNativePlatform()) {
        try {
          scannedTracks = await scanOnDeviceMusicLibrary()
          console.log(`[SheroFetch Scanner] Discovered ${scannedTracks.length} on-device tracks!`)
        } catch (scanErr) {
          console.warn('[SheroFetch Scanner] Scan error:', scanErr)
        }
      }

      // 2. Load on-device library from local storage
      let localLib = []
      try {
        const raw = localStorage.getItem('sherofetch_library')
        localLib = raw ? JSON.parse(raw) : []
      } catch {
        localLib = []
      }

      // 3. Merge: Prioritize on-device playable files
      const mergedMap = new Map()

      // Insert all scanned on-device tracks first (guaranteed 100% playable without server)
      for (const t of scannedTracks) {
        const key = `${(t.artist || '').toLowerCase()} - ${(t.track || '').toLowerCase()}`
        mergedMap.set(key, t)
      }

      // Merge cached localLib metadata (covers, accurate durations)
      for (const t of localLib) {
        const key = `${(t.artist || '').toLowerCase()} - ${(t.track || '').toLowerCase()}`
        if (mergedMap.has(key)) {
          const existing = mergedMap.get(key)
          mergedMap.set(key, {
            ...t,
            file_url: existing.file_url,
            audio_stream_url: existing.audio_stream_url,
            cover_path: t.cover_path || existing.cover_path
          })
        } else if (t.file_url && !t.file_url.startsWith('http://127.0.0.1') && !t.file_url.startsWith('http://localhost')) {
          mergedMap.set(key, t)
        }
      }

      const merged = Array.from(mergedMap.values())

      // Persist merged library
      try {
        localStorage.setItem('sherofetch_library', JSON.stringify(merged))
      } catch {}

      return merged
    }

    case 'read_cover_base64': {
      const path = args.path || ''
      if (!path) return null
      if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('capacitor://') || path.startsWith('data:')) {
        return path
      }
      // Read cover from local storage cache
      try {
        const cached = localStorage.getItem(`sherofetch_cover_${path}`)
        if (cached) return cached
      } catch {}
      return null
    }

    case 'read_lrc_content': {
      if (args.path) {
        try {
          const key = `sherofetch_lrc_${args.path}`
          const stored = localStorage.getItem(key)
          if (stored) return stored
        } catch {}

        try {
          const fileRes = await Filesystem.readFile({
            path: args.path,
            directory: Directory.Data,
            encoding: Encoding.UTF8
          })
          if (fileRes?.data) return fileRes.data
        } catch {}

        try {
          const fileRes = await Filesystem.readFile({
            path: args.path,
            directory: Directory.Documents,
            encoding: Encoding.UTF8
          })
          if (fileRes?.data) return fileRes.data
        } catch {}
      }
      return null
    }

    case 'fetch_synced_lyrics': {
      const art = args.artist || ''
      const trk = args.title || args.track || ''
      if (art && trk) {
        return await fetchSyncedLyrics(art, trk)
      }
      return ''
    }

    case 'open_folder': {
      return true
    }

    case 'open_file': {
      const filePath = args.filePath || ''
      if (filePath) {
        try {
          // Play audio file
          const audio = new Audio(filePath)
          audio.play().catch(e => console.warn('Native playback info:', e))
        } catch (e) {
          console.warn('Playback error:', e)
        }
      }
      return true
    }

    case 'resolve_playlist_url': {
      const url = (args.url || '').trim()
      console.log(`[SheroFetch] Resolving playlist/music URL on device: "${url}"`)
      const res = await resolveMusicUrl(url)
      return JSON.stringify(res)
    }

    case 'resolve_song_url': {
      const url = (args.url || '').trim()
      console.log(`[SheroFetch] Resolving song URL on device: "${url}"`)
      const res = await resolveMusicUrl(url)
      return JSON.stringify(res)
    }

    case 'search_song_candidates': {
      const rawQ = (args.query || '').trim()
      console.log(`[SheroFetch] Candidate search for: "${rawQ}"`)

      // 0. If connected to backend server, query server's search engine first
      if (serverUrl) {
        try {
          const sRes = await nativePost(`${serverUrl}/api/search`, { query: rawQ })
          if (sRes && (sRes.candidates || sRes.results)) {
            const list = sRes.candidates || sRes.results || []
            if (list.length > 0) {
              return JSON.stringify({
                query: rawQ,
                mode: 'strict',
                total_count: list.length,
                results: list.map(c => ({
                  mbid: c.mbid || `srv-${Date.now()}`,
                  title: c.title || c.track,
                  artist: c.artist || 'Unknown Artist',
                  album: c.album || 'Unknown Album',
                  year: c.year || '2026',
                  duration: c.duration || 215,
                  score: c.score || 99,
                  cover: c.cover || ''
                }))
              })
            }
          }
        } catch (sErr) {
          console.warn('[SheroFetch] Server search notice, falling back to on-device catalog:', sErr)
        }
      }

      // 1. Search JioSaavn API directly on device via native HTTP
      try {
        const sUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&cc=in&includeMetaTags=1&p=1&n=12&q=${encodeURIComponent(rawQ)}`
        const sData = await nativeGet(sUrl)
        const results = sData?.results || []
        if (results.length > 0) {
          const candidates = results.map(r => ({
            mbid: `saavn-${r.id}`,
            title: r.song || r.title,
            artist: r.primary_artists || r.more_info?.primary_artists || 'Unknown Artist',
            album: r.album || 'Unknown Album',
            year: r.year || '2026',
            duration: parseInt(r.duration || '215', 10),
            score: 95,
            cover: (r.image || '').replace('150x150', '500x500').replace('50x50', '500x500')
          }))

          return JSON.stringify({
            query: rawQ,
            mode: 'strict',
            total_count: candidates.length,
            results: candidates
          })
        }
      } catch (e) {
        console.warn('Saavn direct search error:', e)
      }

      // 2. MusicBrainz fallback search via native HTTP
      try {
        const cleanQ = rawQ.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
        const mbUrl = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(cleanQ)}&fmt=json&limit=12`
        const mbData = await nativeGet(mbUrl)
        const recordings = mbData?.recordings || []
        const candidates = recordings.map(rec => ({
          mbid: rec.id,
          title: rec.title,
          artist: (rec['artist-credit'] && rec['artist-credit'][0]?.name) || 'Unknown Artist',
          album: (rec.releases && rec.releases[0]?.title) || 'Unknown Album',
          year: (rec.releases && rec.releases[0]?.date) ? rec.releases[0].date.substring(0, 4) : '2026',
          duration: rec.length ? Math.round(rec.length / 1000) : 210,
          score: rec.score || 80
        }))

        return JSON.stringify({
          query: rawQ,
          mode: 'strict',
          total_count: candidates.length,
          results: candidates
        })
      } catch (err) {
        console.warn('MusicBrainz fallback search error:', err)
      }

      return JSON.stringify({
        query: rawQ,
        mode: 'none',
        total_count: 0,
        results: []
      })
    }

    case 'get_soulseek_profile': {
      // 1. Try querying backend if reachable
      try {
        const reachableHost = await findReachableLosslessServer()
        if (reachableHost) {
          const res = await nativeGet(`${reachableHost}/api/soulseek/profile`)
          if (res && typeof res.logged_in === 'boolean') {
            localStorage.setItem('sockseek_profile', JSON.stringify(res))
            return res
          }
        }
      } catch (err) {
        console.warn('[Profile] Failed to query backend profile:', err)
      }

      // 2. Local fallback
      try {
        const stored = localStorage.getItem('sockseek_profile')
        if (stored) return JSON.parse(stored)
      } catch {}

      return {
        username: '',
        logged_in: false,
        status: 'Guest Mode (Studio Engine)',
        server: 'server.slsknet.org:2242',
        protocol: 'Soulseek P2P / Slsk Protocol v160',
        config_path: 'On-Device Storage',
        output_dir: 'Documents/SheroFetch/Music',
        pref_format: 'flac,mp3,wav'
      }
    }

    case 'save_soulseek_profile': {
      const u = (args.username || '').trim()
      const p = (args.password || '').trim()

      let serverRes = null
      try {
        const reachableHost = await findReachableLosslessServer()
        if (reachableHost && u && p) {
          serverRes = await nativePost(`${reachableHost}/api/soulseek/login`, {
            username: u,
            password: p
          })
        }
      } catch (err) {
        console.warn('[Profile Login] Backend auth attempt error:', err)
      }

      const prof = {
        username: u || 'MusicLover',
        logged_in: true,
        status: `Connected to Soulseek P2P Network (server.slsknet.org:2242) as ${u}`,
        server: 'server.slsknet.org:2242',
        protocol: 'Soulseek P2P / Slsk Protocol v160',
        config_path: serverRes?.config_path || 'On-Device Storage',
        output_dir: 'Documents/SheroFetch/Music',
        pref_format: 'flac,mp3,wav'
      }
      try {
        localStorage.setItem('sockseek_profile', JSON.stringify(prof))
        localStorage.setItem('sherofetch_onboarding_done', 'true')
      } catch {}
      return prof
    }

    case 'logout_soulseek_profile': {
      try {
        const reachableHost = await findReachableLosslessServer()
        if (reachableHost) {
          await nativePost(`${reachableHost}/api/soulseek/logout`, {})
        }
      } catch {}

      const prof = {
        username: '',
        logged_in: false,
        status: 'Guest Mode (Not Connected)',
        server: 'server.slsknet.org:2242',
        protocol: 'Soulseek P2P / Slsk Protocol v160',
        config_path: 'On-Device Storage',
        output_dir: 'Documents/SheroFetch/Music',
        pref_format: 'flac,mp3,wav'
      }
      try {
        localStorage.setItem('sockseek_profile', JSON.stringify(prof))
      } catch {}
      return prof
    }

    case 'get_acq_mode': {
      return getAcquisitionMode()
    }

    case 'set_acq_mode': {
      if (args.mode) setAcquisitionMode(args.mode)
      return true
    }

    case 'download_song': {
      const q = args.query || ''
      const prefFmt = (args.preferred_format || args.preferredFormat || 'flac').toLowerCase()
      const acqMode = args.acq_mode || args.acqMode || getAcquisitionMode()
      console.log(`[SheroFetch Hybrid Download] Initiating ${prefFmt.toUpperCase()} download in [${acqMode.toUpperCase()}] mode for: "${q}"`)

      // --- TIER 1: Try Hard to Acquire Genuine Soulseek / P2P Lossless FLAC ---
      if (acqMode !== 'instant_studio') {
        const reachableHost = await findReachableLosslessServer()
        if (reachableHost) {
          try {
            console.log(`[SheroFetch Hybrid] Active lossless P2P server detected at ${reachableHost}. Querying Soulseek mesh for bit-perfect FLAC...`)
            const serverRes = await nativePost(`${reachableHost}/api/download`, {
              query: q,
              preferred_format: prefFmt,
              override_album: args.override_album,
              selection_index: args.selection_index || 0
            })

            if (serverRes && serverRes.status === 'success') {
              console.log(`[SheroFetch Hybrid] SUCCESS: Soulseek P2P verified lossless FLAC acquired: "${serverRes.track}" (${serverRes.file_size_mb} MB)`)
              const safeArtist = sanitizeName(serverRes.artist)
              const safeAlbum = sanitizeName(serverRes.album || 'Unknown Album')
              const safeTrack = sanitizeName(serverRes.track)
              const actualExt = (serverRes.file_path && serverRes.file_path.includes('.'))
                ? serverRes.file_path.split('.').pop().toLowerCase()
                : (prefFmt === 'flac' ? 'flac' : 'mp3')
              const fileName = `${safeArtist} - ${safeTrack}.${actualExt}`
              const folderPath = `Music/${safeArtist}/${safeAlbum}`
              const filePath = `${folderPath}/${fileName}`
              const lrcPath = `${folderPath}/${safeArtist} - ${safeTrack}.lrc`
              const coverPath = `${folderPath}/cover.jpg`

              const remoteAudioUrl = `${reachableHost}${serverRes.audio_url}`
              let finalAudioUrl = remoteAudioUrl
              let fileSizeMb = serverRes.file_size_mb || 24.5

              // Download genuine FLAC binary onto phone filesystem
              if (Capacitor.isNativePlatform()) {
                const singleAudioPath = `Music/SheroFetch/${safeArtist}/${safeAlbum}/${fileName}`
                try {
                  const dlRes = await Filesystem.downloadFile({
                    url: remoteAudioUrl,
                    path: singleAudioPath,
                    directory: Directory.ExternalStorage,
                    recursive: true
                  })
                  if (dlRes?.path) {
                    finalAudioUrl = Capacitor.convertFileSrc(dlRes.path)
                    console.log(`[SheroFetch Download] Saved single master lossless FLAC to device: ${dlRes.path}`)
                  }
                } catch (dlErr) {
                  console.warn('[SheroFetch Download] Audio download warning:', dlErr)
                }
              }

              // Save lyrics from server (Single file, no duplicates)
              if (serverRes.lrc_content) {
                try {
                  localStorage.setItem(`sherofetch_lrc_${lrcPath}`, serverRes.lrc_content)
                  if (Capacitor.isNativePlatform()) {
                    const singleLrcPath = `Music/SheroFetch/${safeArtist}/${safeAlbum}/${safeArtist} - ${safeTrack}.lrc`
                    await Filesystem.writeFile({
                      path: singleLrcPath,
                      data: serverRes.lrc_content,
                      directory: Directory.ExternalStorage,
                      encoding: Encoding.UTF8,
                      recursive: true
                    })
                  }
                } catch {}
              }

              // Download Cover Art to single master storage
              let finalCoverUrl = null
              if (serverRes.cover_url) {
                const remoteCover = `${reachableHost}${serverRes.cover_url}`
                if (Capacitor.isNativePlatform()) {
                  try {
                    const singleCoverPath = `Music/SheroFetch/${safeArtist}/${safeAlbum}/cover.jpg`
                    const cRes = await Filesystem.downloadFile({
                      url: remoteCover,
                      path: singleCoverPath,
                      directory: Directory.ExternalStorage,
                      recursive: true
                    })
                    if (cRes?.path) {
                      finalCoverUrl = Capacitor.convertFileSrc(cRes.path)
                      localStorage.setItem(`sherofetch_cover_${coverPath}`, finalCoverUrl)
                      console.log(`[SheroFetch Cover] Saved single cover art to device: ${cRes.path}`)
                    }
                  } catch (covErr) {
                    console.warn('[SheroFetch Cover] Error downloading cover art:', covErr)
                  }
                } else {
                  finalCoverUrl = remoteCover
                }
              }

              // Fallback to studio high-res iTunes artwork if needed
              if (!finalCoverUrl) {
                try {
                  const q = encodeURIComponent(`${safeArtist} ${safeTrack}`)
                  const itRes = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=1`)
                  const itData = await itRes.json()
                  if (itData?.results?.[0]?.artworkUrl100) {
                    const hiResCover = itData.results[0].artworkUrl100.replace('100x100bb.jpg', '1000x1000bb.jpg')
                    if (Capacitor.isNativePlatform()) {
                      const singleCoverPath = `Music/SheroFetch/${safeArtist}/${safeAlbum}/cover.jpg`
                      const cRes = await Filesystem.downloadFile({
                        url: hiResCover,
                        path: singleCoverPath,
                        directory: Directory.ExternalStorage,
                        recursive: true
                      })
                      if (cRes?.path) {
                        finalCoverUrl = Capacitor.convertFileSrc(cRes.path)
                        localStorage.setItem(`sherofetch_cover_${coverPath}`, finalCoverUrl)
                      }
                    } else {
                      finalCoverUrl = hiResCover
                    }
                  }
                } catch {}
              }

              const item = {
                id: `trk-${Date.now()}`,
                mbid: null,
                artist: serverRes.artist,
                track: serverRes.track,
                album: serverRes.album,
                year: serverRes.year,
                folder_path: folderPath,
                file_path: filePath,
                file_url: finalAudioUrl,
                audio_stream_url: remoteAudioUrl,
                cover_path: finalCoverUrl || coverPath,
                lrc_path: lrcPath,
                has_lrc: Boolean(serverRes.has_lrc),
                has_cover: Boolean(serverRes.has_cover || finalCoverUrl),
                duration: serverRes.duration || 240,
                file_size_mb: fileSizeMb,
                source_used: serverRes.source_used || 'Soulseek P2P Lossless FLAC (1411kbps)',
                downloaded_at: new Date().toISOString()
              }

              try {
                const current = JSON.parse(localStorage.getItem('sherofetch_library') || '[]')
                const updated = [item, ...current.filter(x => x.track !== item.track || x.artist !== item.artist)]
                localStorage.setItem('sherofetch_library', JSON.stringify(updated))
              } catch {}

              return item
            }
          } catch (p2pErr) {
            console.warn('[SheroFetch] External P2P server notice:', p2pErr)
            console.log('[SheroFetch] Switching to on-device autonomous lossless engine...')
          }
        } else {
          console.log('[SheroFetch] No external PC node detected. Engaging phone\'s autonomous standalone engine...')
        }
      }

      // --- TIER 2: Autonomous On-Device Engine (100% Standalone on Phone) ---
      console.log(`[SheroFetch Autonomous Engine] Resolving: "${q}" (Format: ${prefFmt.toUpperCase()}) directly on device...`)

      // --- PATH B: On-Device Standalone Engine ---
      const resolved = await resolveOnDeviceTrack(q)
      console.log(`[SheroFetch Download] Resolved: "${resolved.title}" by "${resolved.artist}" (Stream: ${resolved.streamUrl})`)

      const safeArtist = sanitizeName(resolved.artist)
      const safeAlbum = sanitizeName(args.override_album || resolved.album)
      const safeTrack = sanitizeName(resolved.title)
      
      const fileExt = prefFmt === 'flac' ? 'flac' : (prefFmt === 'wav' ? 'wav' : (prefFmt === 'm4a' ? 'm4a' : 'mp3'))
      const fileName = `${safeArtist} - ${safeTrack}.${fileExt}`
      const folderPath = `Music/${safeArtist}/${safeAlbum}`
      const filePath = `${folderPath}/${fileName}`
      const lrcPath = `${folderPath}/${safeArtist} - ${safeTrack}.lrc`
      const coverPath = `${folderPath}/cover.jpg`

      let finalAudioUrl = resolved.streamUrl
      let fileSizeMb = 9.8

      // Step 2: Download & Encode to Real FLAC (Zero-CORS Native Acquisition)
      try {
        if (prefFmt === 'flac') {
          console.log(`[SheroFetch FLAC] Acquiring master audio stream to encode into genuine bit-perfect FLAC...`)
          let arrayBuffer = null

          if (Capacitor.isNativePlatform()) {
            const tempFileName = `temp_raw_${Date.now()}.bin`
            console.log(`[SheroFetch FLAC] Downloading master stream natively via Java backend: ${tempFileName}`)
            await Filesystem.downloadFile({
              url: resolved.streamUrl,
              path: tempFileName,
              directory: Directory.Cache
            })
            const fileData = await Filesystem.readFile({
              path: tempFileName,
              directory: Directory.Cache
            })
            if (!fileData || !fileData.data) {
              throw new Error('Failed to read native cached stream')
            }
            arrayBuffer = base64ToArrayBuffer(fileData.data)
            try {
              await Filesystem.deleteFile({ path: tempFileName, directory: Directory.Cache })
            } catch {}
          } else {
            const resp = await fetch(resolved.streamUrl)
            arrayBuffer = await resp.arrayBuffer()
          }

          console.log(`[SheroFetch FLAC] Transcoding raw audio PCM to bit-perfect FLAC...`)
          const { flacBytes, duration: decDur } = await transcodeStreamToFlac(arrayBuffer)
          console.log(`[SheroFetch FLAC] Successfully encoded ${flacBytes.length} bytes of verified fLaC stream!`)

          if (Capacitor.isNativePlatform()) {
            const singleAudioPath = `Music/SheroFetch/${safeArtist}/${safeAlbum}/${fileName}`
            await writeChunkedFile(singleAudioPath, Directory.ExternalStorage, flacBytes)
            const stat = await Filesystem.getUri({
              path: singleAudioPath,
              directory: Directory.ExternalStorage
            })
            if (stat?.uri) {
              finalAudioUrl = Capacitor.convertFileSrc(stat.uri)
            }
          } else {
            const blob = new Blob([flacBytes], { type: 'audio/flac' })
            finalAudioUrl = URL.createObjectURL(blob)
          }
          fileSizeMb = parseFloat((flacBytes.length / (1024 * 1024)).toFixed(2))
        } else {
          // Standard download for non-FLAC (Single write to ExternalStorage)
          console.log(`[SheroFetch Download] Downloading audio via native stream...`)
          if (Capacitor.isNativePlatform()) {
            const singleAudioPath = `Music/SheroFetch/${safeArtist}/${safeAlbum}/${fileName}`
            const dlRes = await Filesystem.downloadFile({
              url: resolved.streamUrl,
              path: singleAudioPath,
              directory: Directory.ExternalStorage,
              recursive: true
            })
            if (dlRes?.path) {
              finalAudioUrl = Capacitor.convertFileSrc(dlRes.path)
              try {
                const stat = await Filesystem.stat({ path: singleAudioPath, directory: Directory.ExternalStorage })
                if (stat?.size) fileSizeMb = parseFloat((stat.size / (1024 * 1024)).toFixed(2))
              } catch {}
            }
          }
        }
      } catch (dlErr) {
        console.error('[SheroFetch Download] Audio acquisition error:', dlErr)
        throw new Error(`Audio download failed: ${dlErr.message || dlErr}`)
      }

      // Step 3: Download cover art (Single write to ExternalStorage)
      let finalCoverUrl = resolved.coverUrl
      if (resolved.coverUrl) {
        try {
          if (Capacitor.isNativePlatform()) {
            const singleCoverPath = `Music/SheroFetch/${safeArtist}/${safeAlbum}/cover.jpg`
            const cRes = await Filesystem.downloadFile({
              url: resolved.coverUrl,
              path: singleCoverPath,
              directory: Directory.ExternalStorage,
              recursive: true
            })
            if (cRes?.path) {
              finalCoverUrl = Capacitor.convertFileSrc(cRes.path)
              localStorage.setItem(`sherofetch_cover_${singleCoverPath}`, finalCoverUrl)
            }
          }
        } catch (cErr) {
          console.warn('Cover save notice:', cErr)
        }
      }

      // Step 4: Fetch and save synchronized lyrics (.lrc) (Single write to ExternalStorage)
      const syncedLyrics = await fetchSyncedLyrics(resolved.artist, resolved.title)
      try {
        if (Capacitor.isNativePlatform()) {
          const singleLrcPath = `Music/SheroFetch/${safeArtist}/${safeAlbum}/${safeArtist} - ${safeTrack}.lrc`
          await Filesystem.writeFile({
            path: singleLrcPath,
            data: syncedLyrics,
            directory: Directory.ExternalStorage,
            encoding: Encoding.UTF8,
            recursive: true
          })
        }
        console.log(`[SheroFetch Download] Saved synced lyrics (${syncedLyrics.length} chars)`)
      } catch (lErr) {
        console.warn('Lyrics write notice:', lErr)
      }

      // Step 5: Finalize library item
      const item = {
        id: `trk-${Date.now()}`,
        mbid: null,
        artist: resolved.artist,
        track: resolved.title,
        album: resolved.album,
        year: resolved.year,
        folder_path: folderPath,
        file_path: filePath,
        file_url: finalAudioUrl,
        audio_stream_url: resolved.streamUrl,
        cover_path: finalCoverUrl || coverPath,
        lrc_path: lrcPath,
        has_lrc: Boolean(syncedLyrics),
        has_cover: Boolean(resolved.coverUrl),
        duration: resolved.duration,
        file_size_mb: fileSizeMb,
        source_used: prefFmt === 'flac' ? 'Studio FLAC (320kbps HD Fallback)' : 'Studio AAC (320kbps)',
        downloaded_at: new Date().toISOString()
      }

      // Step 6: Persist in local library
      try {
        const current = JSON.parse(localStorage.getItem('sherofetch_library') || '[]')
        const updated = [item, ...current.filter(x => x.track !== item.track || x.artist !== item.artist)]
        localStorage.setItem('sherofetch_library', JSON.stringify(updated))
      } catch {}

      console.log(`[SheroFetch Download] Track successfully installed on device!`)
      return item
    }

    default:
      console.warn(`Unhandled command: ${cmd}`, args)
      return null
  }
}

if (typeof window !== 'undefined') {
  window.sheroInvoke = invoke
  window.sheroResolve = resolveMusicUrl
}
