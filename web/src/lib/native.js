// Inside the Android app (Capacitor) the page is served from the phone itself, so it opens with no
// signal. These helpers cover what only the app can do: save songs into Music/SheroFetch with a
// media scan, list what is already on the phone, and hold requests made offline until the queue
// can be reached again.
import { Capacitor, registerPlugin } from '@capacitor/core'

export const isNative = Capacitor.isNativePlatform()
export const SITE = 'https://sherofetch.vercel.app'
// The search function lives on Vercel; in the app it has to be asked by its full address.
export const apiUrl = (path) => (isNative ? `${SITE}${path}` : path)
export const siteUrl = (path) => (isNative ? `${SITE}${path}` : path)

const SheroSave = isNative ? registerPlugin('SheroSave') : null

// Same rules as the PC library (path_manager.sanitize_component), so both vaults look alike.
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
export function safeName(value, fallback) {
  let s = String(value || '').trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, '')
  if (RESERVED.test(s.split('.')[0])) s = `${s}_`
  return s.slice(0, 120) || fallback
}

// Music/SheroFetch/<Artist>/<Album>/<Artist> - <Track>.<ext>, relative to Music/SheroFetch.
export function vaultPaths(r) {
  const artist = safeName(r.artist, 'Unknown Artist')
  const album = safeName(r.album, 'Unknown Album')
  const base = `${artist}/${album}/${safeName(`${r.artist || 'Unknown Artist'} - ${r.track || 'Untitled'}`, 'Untitled')}`
  return { dir: `${artist}/${album}`, audio: `${base}.${r.ext || 'mp3'}`, lrc: `${base}.lrc`, cover: `${artist}/${album}/cover.jpg` }
}

/** Saves one finished job into the phone's music vault. Returns the audio file's path. */
export async function saveToPhone(job, { file, cover }, onProgress) {
  const r = job.result || {}
  const p = vaultPaths(r)
  const sub = onProgress ? await SheroSave.addListener('progress', (e) => { if (e.url === file) onProgress(e.progress) }) : null
  try {
    const saved = await SheroSave.download({ url: file, path: p.audio })
    // No cover.jpg: Android only lets an app create audio files in Music/, and the album art is
    // already embedded in the song, which is what Poweramp and other players show.
    if (job.lrc) await SheroSave.writeText({ path: p.lrc, text: job.lrc }).catch(() => {})
    rememberSaved(job.id, saved.path)
    return saved.path
  } finally {
    sub?.remove()
  }
}

/** Songs already in Music/SheroFetch on this phone, newest first. */
export async function phoneSongs() {
  if (!SheroSave) return []
  const { songs } = await SheroSave.list()
  return (songs || []).sort((a, b) => b.modified - a.modified).map((s) => {
    const stem = s.name.replace(/\.[^.]+$/, '')
    const [artist, ...rest] = stem.split(' - ')
    return { ...s, artist: rest.length ? artist : '', track: rest.length ? rest.join(' - ') : stem, ext: s.name.split('.').pop(), src: Capacitor.convertFileSrc(s.path), art: s.cover ? Capacitor.convertFileSrc(s.cover) : null }
  })
}

export const localSrc = (path) => Capacitor.convertFileSrc(path)
/** Status-bar icons follow the site look: dark on Crayon, light on Stage. */
export function syncBars() {
  if (!SheroSave) return
  const apply = () => SheroSave.setBars({ light: document.documentElement.dataset.theme !== 'stage' }).catch(() => {})
  apply()
  addEventListener('sf-theme', apply)
  // Some phones (Oppo/ColorOS) reset the icon colour when the screen turns.
  addEventListener('resize', () => setTimeout(apply, 250))
}
export const writePhoneText = (path, text) => SheroSave?.writeText({ path, text })

/** File name -> path of every song already in Music/SheroFetch (saved here, or fetched by this phone as a server). */
export async function phoneIndex() {
  if (!SheroSave) return new Map()
  try { return new Map((await SheroSave.list()).songs?.map((s) => [s.name.toLowerCase(), s.path]) || []) } catch { return new Map() }
}
export const audioName = (r) => vaultPaths(r).audio.split('/').at(-1).toLowerCase()

export async function readLocalText(path) {
  try { return await (await fetch(Capacitor.convertFileSrc(path))).text() } catch { return null }
}

/* ---------- which jobs are already on this phone ---------- */

const SAVED_KEY = 'sf-saved'
function readSaved() { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '{}') } catch { return {} } }
function rememberSaved(id, path) { try { localStorage.setItem(SAVED_KEY, JSON.stringify({ ...readSaved(), [id]: path })) } catch { /* storage off */ } }
export const savedPath = (id) => readSaved()[id] || null

/* ---------- requests made while the queue could not be reached ---------- */

const OUTBOX_KEY = 'sf-outbox'
export function outbox() { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]') } catch { return [] } }
export function setOutbox(rows) { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(rows)) } catch { /* storage off */ } }
export function addToOutbox(row) { setOutbox([...outbox(), { ...row, _at: Date.now() }]) }

/* ---------- lock-screen and notification controls ---------- */

/**
 * Mirrors the page's <audio> into the phone's media controls (lock screen, notification shade,
 * headset buttons). In the app this goes through the native media session; on the website the
 * browser's own Media Session does it. Returns a function that stops mirroring.
 */
export function mirrorMedia(el, { title, artist, art, file }, actions) {
  const subs = []
  if (SheroSave) {
    SheroSave.nowPlaying({ title: title || '', artist: artist || '', duration: el.duration || 0, art: art || undefined, file: file || undefined }).catch(() => {})
    const state = () => SheroSave.mediaState({ playing: !el.paused && !el.ended, position: el.currentTime || 0, duration: el.duration || 0 }).catch(() => {})
    for (const ev of ['play', 'pause', 'ended', 'seeked', 'loadedmetadata']) { el.addEventListener(ev, state); subs.push(() => el.removeEventListener(ev, state)) }
    const h = SheroSave.addListener('media', (e) => actions[e.action]?.(e.position))
    subs.push(() => h.then((x) => x.remove()))
    return () => { subs.forEach((f) => f()); SheroSave.mediaStop().catch(() => {}) }
  }
  const ms = navigator.mediaSession
  if (!ms || typeof MediaMetadata === 'undefined') return () => {}
  ms.metadata = new MediaMetadata({ title: title || '', artist: artist || '', artwork: art ? [{ src: art, sizes: '200x200', type: 'image/jpeg' }] : [] })
  const set = (k, f) => { try { ms.setActionHandler(k, f) } catch { /* not supported here */ } }
  set('play', () => actions.play())
  set('pause', () => actions.pause())
  set('stop', () => actions.stop())
  set('seekto', (d) => actions.seek(d.seekTime))
  return () => { ms.metadata = null; ['play', 'pause', 'stop', 'seekto'].forEach((k) => set(k, null)) }
}

/** The cover embedded in a song file on this phone, cached small. Null when it has none. */
const artCache = new Map()
export function localArt(path) {
  if (!SheroSave) return Promise.resolve(null)
  if (!artCache.has(path)) artCache.set(path, SheroSave.art({ path, size: 160 }).then((r) => (r.path ? Capacitor.convertFileSrc(r.path) : null)).catch(() => null))
  return artCache.get(path)
}
