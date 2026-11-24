import { useEffect, useState, useCallback } from 'react'
import { supabase, rpc } from '../lib/supabase.js'

const PROFILE_KEY = 'sf-profile'
const JOB_COLUMNS = 'id, user_id, kind, parent_id, query, artist, title, album, duration, url, format, target, status, stage, progress, worker_id, attempts, error, result, created_at, started_at, finished_at, updated_at'

/** The lyrics of one song, or null. Rows from Realtime may already carry them. */
export async function loadLrc(job) {
  if (job.lrc !== undefined) return job.lrc
  const { data } = await supabase.from('jobs').select('lrc').eq('id', job.id).maybeSingle()
  return data?.lrc ?? null
}

// True while the device has a connection and the last Supabase call got an answer.
export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    addEventListener('online', up)
    addEventListener('offline', down)
    return () => { removeEventListener('online', up); removeEventListener('offline', down) }
  }, [])
  return online
}

export function useSession(online = true) {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState(false)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session) { setProfile(null); return }
    setProfileError(false)
    supabase.from('profiles').select('id, username, role, disabled, daily_limit').eq('id', session.user.id).single()
      .then(({ data, error }) => {
        if (error || !data) throw error || new Error('no profile')
        setProfile(data)
        try { localStorage.setItem(PROFILE_KEY, JSON.stringify(data)) } catch { /* storage off */ }
      })
      .catch(() => setProfileError(true))
  }, [session, online])
  const cachedProfile = () => { try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null') } catch { return null } }
  return { session, profile, profileError, cachedProfile }
}

// All of my jobs, kept live through Realtime.
export function useJobs(userId) {
  const [jobs, setJobs] = useState([])
  const [state, setState] = useState('loading')
  const load = useCallback(async () => {
    // Lyrics are left out of the list (they are most of its weight with big playlists) and
    // fetched when a song is played or saved.
    const { data, error } = await supabase.from('jobs').select(JOB_COLUMNS).eq('user_id', userId).order('created_at', { ascending: false }).limit(1500)
    if (error) { setState('error'); return }
    setJobs(data)
    setState('ready')
  }, [userId])
  useEffect(() => {
    if (!userId) return
    load()
    const ch = supabase.channel(`jobs-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `user_id=eq.${userId}` }, (p) => {
        setJobs((list) => {
          if (p.eventType === 'DELETE') return list.filter((j) => j.id !== p.old.id)
          const i = list.findIndex((j) => j.id === p.new.id)
          if (i === -1) return [p.new, ...list]
          const next = list.slice()
          next[i] = p.new
          return next
        })
      })
      .subscribe()
    const t = setInterval(load, 60000)
    return () => { supabase.removeChannel(ch); clearInterval(t) }
  }, [userId, load])
  return { jobs, state, reload: load }
}

// Where each machine can be reached right now (its tunnel address changes when it restarts).
export function useMachineLinks() {
  const [links, setLinks] = useState({})
  useEffect(() => {
    let live = true
    const load = () => rpc('machine_links').then((rows) => {
      if (live) setLinks(Object.fromEntries((rows || []).map((r) => [r.id, r])))
    }).catch(() => {})
    load()
    const t = setInterval(load, 20000)
    return () => { live = false; clearInterval(t) }
  }, [])
  return links
}

export function fileUrl(job, links, kind = 'file', download = false) {
  const path = job.result?.[kind]
  const m = links[job.worker_id]
  if (!path || !m?.public_url || !m.online) return null
  return `${m.public_url}${path}${download ? '&dl=1' : ''}`
}

export const machineName = (id) => (id === 'worker_phone' ? 'phone' : id === 'worker_pc' ? 'PC' : 'machine')
export const fmtTime = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '')

export function parseLrc(text) {
  if (!text) return []
  const out = []
  for (const line of text.split(/\r?\n/)) {
    const stamps = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]
    const words = line.replace(/\[[^\]]*\]/g, '').trim()
    for (const s of stamps) out.push({ t: Number(s[1]) * 60 + Number(s[2]), text: words })
  }
  return out.sort((a, b) => a.t - b.t)
}

/* ---------- why a song failed, in plain words ---------- */

const RULES = [
  [/longer than 15 minutes/i, 'It took too long', 'The source stalled or the machine was very busy. Trying again usually works.'],
  [/long, but the song is|wrong version|length/i, 'Only wrong versions turned up', 'Every copy Shero found had a different length from the real song, so it was probably a live take, a radio edit or a sped-up upload. Shero did not keep it. Pick the right upload below or paste one.'],
  [/went quiet/i, 'The machine went offline mid-fetch', 'The PC or phone fetching it lost its connection or went to sleep three times. Try again once it is awake.'],
  [/sign in to confirm|not a bot|429|too many requests|http error 403/i, 'YouTube blocked the machine for a while', 'YouTube asked the machine to prove it is not a bot. It usually clears in an hour. Pick a different upload, or try again later.'],
  [/private|unavailable|removed|copyright|blocked in your country|geo/i, 'That upload is not available', 'The video is private, removed or blocked in this country. Pick another upload.'],
  [/no (songs|results|match)|not found|nothing found|could not find/i, 'Shero could not find this song', 'Neither Soulseek nor YouTube had a copy that matched. Check the spelling, or paste a YouTube link of the song.'],
  [/file is missing/i, 'The file vanished after fetching', 'It was fetched but deleted before it could be served, often because the disk is full. Try again.'],
  [/worker error|traceback|exception/i, 'Something broke on the machine', 'This is a bug on the machine side, not your song. Try again; if it keeps failing, tell the owner.'],
]

export function explainFailure(job) {
  const raw = job.error || ''
  if (job.status === 'cancelled') return { title: 'Cancelled', hint: 'You stopped this one. Try again whenever you like.', raw: '' }
  for (const [rx, title, hint] of RULES) if (rx.test(raw) || (job.result?.code === 'length' && title.startsWith('Only'))) return { title, hint, raw }
  return { title: 'Could not fetch', hint: 'Try again, pick an upload, or paste a YouTube link of the song.', raw }
}

export const ytSearch = (j) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${j.artist || ''} ${j.title || j.query}`.trim())}`
export const ytMusicSearch = (j) => `https://music.youtube.com/search?q=${encodeURIComponent(`${j.artist || ''} ${j.title || j.query}`.trim())}`
export const YT_LINK = /^https:\/\/(www\.|music\.|m\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[A-Za-z0-9_-]{6,}/
/** music.youtube.com and m.youtube.com links work too; the server only takes the plain form. */
export const cleanYt = (u) => u.trim().replace('://m.', '://www.').replace('://music.', '://www.').replace(/&.*$/, '')
