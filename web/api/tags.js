// Tags for the library: genre, mood, language and energy for up to 25 songs at a time.
// Genre always comes from iTunes (free, no key). When GEMINI_API_KEY is set on Vercel, Gemini also
// gives mood, language and energy, and a finer genre. Only signed-in members may ask, so the free
// Gemini quota cannot be spent by strangers. The app stores the answers with save_song_tags.
const clean = (s) => String(s || '').trim()
export const tagKey = (artist, track) => `${clean(artist).toLowerCase()}|${clean(track).toLowerCase()}`
const MOODS = ['happy', 'sad', 'romantic', 'chill', 'energetic', 'party', 'angry', 'devotional', 'nostalgic', 'dark', 'motivational']

async function member(req) {
  const token = clean(req.headers.authorization).replace(/^Bearer\s+/i, '')
  const url = process.env.VITE_SUPABASE_URL
  if (!token || !url) return false
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: process.env.VITE_SUPABASE_KEY, authorization: `Bearer ${token}` } })
  return r.ok
}

async function itunesGenre({ artist, track }) {
  try {
    const r = await fetch(`https://itunes.apple.com/search?${new URLSearchParams({ term: `${artist} ${track}`, entity: 'song', limit: '5', country: 'in' })}`)
    const hits = (await r.json()).results || []
    const a = clean(artist).toLowerCase()
    const hit = hits.find((h) => clean(h.artistName).toLowerCase().includes(a.split(/[,&]/)[0].trim())) || hits[0]
    return hit?.primaryGenreName || null
  } catch { return null }
}

async function gemini(songs) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const list = songs.map((s, i) => `${i}. ${s.artist} - ${s.track}${s.album ? ` (album: ${s.album})` : ''}`).join('\n')
  const prompt = `For each song, give its music genre (short and specific, like "Punjabi Pop", "Bollywood Romantic", "Lo-fi", "Hip Hop", "Synthwave"), its mood (one of: ${MOODS.join(', ')}), the language of its lyrics ("Instrumental" if none), and its energy (low, medium or high). If you do not know a song, judge from the artist and title.\n\n${list}`
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: { type: 'ARRAY', items: { type: 'OBJECT', properties: { i: { type: 'INTEGER' }, genre: { type: 'STRING' }, mood: { type: 'STRING', enum: MOODS }, language: { type: 'STRING' }, energy: { type: 'STRING', enum: ['low', 'medium', 'high'] } }, required: ['i', 'genre', 'mood', 'language', 'energy'] } },
    },
  }
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
  })
  if (!r.ok) return null
  try { return JSON.parse((await r.json()).candidates[0].content.parts[0].text) } catch { return null }
}

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-headers', 'authorization, content-type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!(await member(req))) return res.status(401).json({ error: 'Sign in first' })
  const songs = (Array.isArray(req.body?.songs) ? req.body.songs : []).slice(0, 25)
    .map((s) => ({ artist: clean(s.artist).slice(0, 120), track: clean(s.track).slice(0, 160), album: clean(s.album).slice(0, 120) }))
    .filter((s) => s.track)
  if (!songs.length) return res.status(200).json({ tags: [] })
  const [ai, genres] = await Promise.all([gemini(songs), Promise.all(songs.map(itunesGenre))])
  const tags = songs.map((s, i) => {
    const g = ai?.find((x) => x.i === i)
    return { key: tagKey(s.artist, s.track), genre: g?.genre || genres[i], mood: g?.mood || null, language: g?.language || null,
      energy: g?.energy || null, tagged_by: g ? 'gemini' : 'itunes' }
  })
  return res.status(200).json({ tags, ai: Boolean(ai) })
}
