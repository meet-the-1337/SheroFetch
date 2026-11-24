import * as THREE from 'three'

// Shero's boy: an original blocky kid, built from boxes like a toy figure.
// Blue hoodie, orange shorts, a green cap worn backwards, big grin.
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)

export function createKid(kit, palette) {
  const root = new THREE.Group()
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d)
  const skin = kit.fill(mix(palette.yellow, palette.red, 0.18))
  const hoodie = kit.fill(palette.blue)
  const shorts = kit.fill(mix(palette.red, palette.yellow, 0.45))
  const cap = kit.fill(mix(palette.blue, palette.yellow, 0.6))
  const shoe = kit.fill(palette.paper)
  const ink = kit.ink()
  const part = (geo, mat, x, y, z, parent = root, thick = 0.03) => {
    const m = kit.drawn(geo, mat, { thick })
    m.position.set(x, y, z)
    parent.add(m)
    return m
  }

  const legs = [-0.2, 0.2].map((x) => {
    const hip = new THREE.Group()
    hip.position.set(x, 0.9, 0)
    part(box(0.36, 0.5, 0.4), shorts, 0, -0.2, 0, hip)
    part(box(0.3, 0.32, 0.32), skin, 0, -0.6, 0, hip)
    part(box(0.36, 0.16, 0.48), shoe, 0, -0.82, 0.04, hip)
    root.add(hip)
    return hip
  })
  const torso = part(box(0.9, 0.85, 0.5), hoodie, 0, 1.32, 0)
  part(box(0.5, 0.18, 0.04), kit.fill(mix(palette.blue, palette.paper, 0.5)), 0, 1.15, 0.27)
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group()
    sh.position.set(s * 0.6, 1.66, 0)
    part(box(0.3, 0.62, 0.34), hoodie, 0, -0.28, 0, sh)
    part(box(0.26, 0.2, 0.28), skin, 0, -0.68, 0, sh)
    root.add(sh)
    return sh
  })

  const head = new THREE.Group()
  head.position.set(0, 1.78, 0)
  part(box(0.82, 0.78, 0.74), skin, 0, 0.4, 0, head, 0.035)
  // Cap worn backwards, brim at the back.
  part(box(0.88, 0.24, 0.8), cap, 0, 0.86, 0, head)
  part(box(0.7, 0.06, 0.4), cap, 0, 0.76, -0.55, head)
  // Face: dot eyes, a wide grin, rosy cheeks.
  for (const x of [-0.18, 0.18]) {
    const eye = new THREE.Mesh(box(0.1, 0.14, 0.02), ink)
    eye.position.set(x, 0.48, 0.38)
    head.add(eye)
    const cheek = new THREE.Mesh(box(0.14, 0.07, 0.02), kit.ink(mix(palette.red, palette.paper, 0.4)))
    cheek.position.set(x * 1.6, 0.33, 0.38)
    head.add(cheek)
  }
  const grin = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16, Math.PI, Math.PI), ink)
  grin.position.set(0, 0.28, 0.381)
  head.add(grin)
  root.add(head)

  const st = { t: 0, wave: 0, dance: 0, walk: 0, phase: 0 }
  return {
    root, head, torso,
    wave() { st.wave = 1.6 },
    dance() { st.dance = 2.4 },
    setWalking(on) { st.walk = on ? 1 : 0 },
    update(dt) {
      st.t += dt
      st.wave = Math.max(0, st.wave - dt)
      st.dance = Math.max(0, st.dance - dt)
      st.phase += dt * 10 * st.walk
      const swing = Math.sin(st.phase) * 0.7 * st.walk
      legs[0].rotation.x = swing
      legs[1].rotation.x = -swing
      arms[0].rotation.x = -swing
      arms[1].rotation.x = swing
      if (st.wave > 0) { arms[1].rotation.z = 2.6 + Math.sin(st.t * 14) * 0.35; arms[1].rotation.x = 0 }
      else arms[1].rotation.z *= Math.exp(-dt * 8)
      // The bottom-wiggle dance: hips sway, arms out.
      const d = st.dance > 0 ? 1 : 0
      root.rotation.z = Math.sin(st.t * 12) * 0.12 * d
      arms[0].rotation.z = -1.2 * d + arms[0].rotation.z * (1 - d) * Math.exp(-dt * 8)
      head.rotation.y = Math.sin(st.t * 0.9) * 0.18 * (1 - d) + Math.sin(st.t * 12) * 0.15 * d
      torso.position.y = 1.32 + Math.sin(st.t * 2.4) * 0.015
    },
  }
}
