import { useEffect, useState, useCallback } from 'react'
import { supabase, rpc } from '../lib/supabase.js'

export function useSession() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session) { setProfile(null); return }
    supabase.from('profiles').select('id, username, role, disabled, daily_limit').eq('id', session.user.id).single()
      .then(({ data }) => setProfile(data))
  }, [session])
  return { session, profile }
}

// All of my jobs, kept live through Realtime.
export function useJobs(userId) {
  const [jobs, setJobs] = useState([])
  const [state, setState] = useState('loading')
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('jobs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(300)
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
