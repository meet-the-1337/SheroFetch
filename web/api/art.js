// Cover art proxy so WebGL can read the pixels (CORS). Only known artwork CDNs, images only, 3 MB cap.
const ALLOWED = /^https:\/\/([a-z0-9-]+\.)*(mzstatic\.com|dzcdn\.net|ytimg\.com|scdn\.co)\//i
const MAX = 3_000_000

export default async function handler(req, res) {
  const u = String(req.query?.u || '')
  if (!ALLOWED.test(u)) return res.status(400).send('That image host is not allowed.')
  let r
  try { r = await fetch(u, { redirect: 'error' }) } catch { return res.status(502).send('The image host did not answer.') }
  if (!r.ok) return res.status(502).send('The image host refused.')
  const type = r.headers.get('content-type') || ''
  if (!/^image\/(jpeg|png|webp)$/.test(type)) return res.status(415).send('Not an image.')
  if (Number(r.headers.get('content-length') || 0) > MAX) return res.status(413).send('Image too large.')
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length > MAX) return res.status(413).send('Image too large.')
  res.setHeader('content-type', type)
  res.setHeader('cache-control', 'public, max-age=86400, s-maxage=2592000, immutable')
  res.setHeader('access-control-allow-origin', '*')
  return res.status(200).send(buf)
}
