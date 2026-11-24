// Song search for the site: iTunes first, Deezer as the fallback. No key needed for either.
const clean = (s) => String(s || '').trim()

async function itunes(q, country) {
  const url = `https://itunes.apple.com/search?${new URLSearchParams({ term: q, entity: 'song', limit: '15', country })}`
  const r = await fetch(url, { redirect: 'error' })
  if (!r.ok) throw new Error(`itunes ${r.status}`)
  const data = await r.json()
  return (data.results || []).map((it) => ({
    title: clean(it.trackName),
    artist: clean(it.artistName),
    album: clean(it.collectionName),
    year: clean(it.releaseDate).slice(0, 4),
    duration: Math.round((it.trackTimeMillis || 0) / 1000),
    art: clean(it.artworkUrl100).replace(/\/\d+x\d+bb\./, '/600x600bb.'),
  }))
}

async function deezer(q) {
  const r = await fetch(`https://api.deezer.com/search?${new URLSearchParams({ q, limit: '15' })}`, { redirect: 'error' })
  if (!r.ok) throw new Error(`deezer ${r.status}`)
  const data = await r.json()
  return (data.data || []).map((it) => ({
    title: clean(it.title),
    artist: clean(it.artist?.name),
    album: clean(it.album?.title),
    year: '',
    duration: it.duration || 0,
    art: clean(it.album?.cover_xl || it.album?.cover_big),
  }))
}

export default async function handler(req, res) {
  const q = clean(req.query?.q).slice(0, 120)
  if (q.length < 2) return res.status(200).json({ results: [] })
  const country = /^[a-z]{2}$/i.test(req.query?.country || '') ? req.query.country : 'IN'
  let list = []
  try {
    list = await itunes(q, country)
  } catch {
    try { list = await deezer(q) } catch { return res.status(502).json({ results: [], error: 'Search is not answering right now.' }) }
  }
  const seen = new Set()
  const results = []
  for (const it of list) {
    const key = `${it.artist}|${it.title}`.toLowerCase()
    if (!it.title || seen.has(key)) continue
    seen.add(key)
    results.push(it)
    if (results.length >= 8) break
  }
  res.setHeader('cache-control', 'public, s-maxage=86400, stale-while-revalidate=604800')
  return res.status(200).json({ results })
}
