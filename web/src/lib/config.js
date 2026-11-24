export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || ''
export const hasBackend = Boolean(SUPABASE_URL && SUPABASE_KEY)

const ref = (() => { try { return new URL(SUPABASE_URL).hostname.split('.')[0] } catch { return '' } })()
export const AUTH_STORAGE_KEY = ref ? `sb-${ref}-auth-token` : 'sb-auth-token'

export function hasSession() {
  try { return Boolean(localStorage.getItem(AUTH_STORAGE_KEY)) } catch { return false }
}

export const FORMATS = {
  mp3: { ext: 'mp3', size: 'about 8 MB for a 4-minute song', note: 'Plays everywhere. Encoded at the best variable bitrate the source allows.' },
  flac: { ext: 'flac', size: 'about 25 to 35 MB for a 4-minute song', note: 'Lossless when Soulseek has a real FLAC. Otherwise it is converted from YouTube audio, and the app tells you which.' },
  opus: { ext: 'opus', size: 'about 4 MB for a 4-minute song', note: 'The smallest file: YouTube’s own audio stream, usually kept exactly as it is.' },
}

export function savedFormat() {
  try { const f = localStorage.getItem('sf-format'); return FORMATS[f] ? f : 'mp3' } catch { return 'mp3' }
}
export function saveFormat(f) { try { localStorage.setItem('sf-format', f) } catch { /* private mode */ } }

export const PLAYLIST_RE = /^(https?:\/\/)?(open\.spotify\.com\/(playlist|album|track)\/|(www\.|music\.)?youtube\.com\/(playlist|watch)|youtu\.be\/|music\.apple\.com\/|www\.jiosaavn\.com\/)/i
