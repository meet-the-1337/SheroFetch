import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

// The Stage look's hero: a turntable under one warm spotlight, a ring of level meters on the floor
// that move to the beat, and album sleeves drifting behind. Drag the record to scratch it, tap it
// to lift or drop the needle. It has the same small API as the crayon hero, so the search box
// talks to whichever one is on the page.

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
function cssColor(name, fallback) {
  const c = document.createElement('canvas').getContext('2d')
  c.fillStyle = fallback
  c.fillStyle = css(name) || fallback
  c.fillRect(0, 0, 1, 1)
  const [r, g, b] = c.getImageData(0, 0, 1, 1).data
  return new THREE.Color(r / 255, g / 255, b / 255)
}

function grooveTexture() {
  const n = 1024
  const c = document.createElement('canvas')
  c.width = c.height = n
  const g = c.getContext('2d')
  g.fillStyle = '#0b0b0c'
  g.fillRect(0, 0, n, n)
  // fine grooves, with a few wider gaps between tracks
  for (let r = n * 0.18; r < n * 0.495; r += 1.6) {
    const gap = [0.27, 0.33, 0.39, 0.44].some((t) => Math.abs(r / n - t) < 0.004)
    const v = gap ? 40 : 14 + Math.random() * 16
    g.strokeStyle = `rgb(${v},${v},${v + 2})`
    g.lineWidth = 1
    g.beginPath()
    g.arc(n / 2, n / 2, r, 0, Math.PI * 2)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function labelTexture(accent, title) {
  const n = 512
  const c = document.createElement('canvas')
  c.width = c.height = n
  const g = c.getContext('2d')
  const draw = (line) => {
    g.clearRect(0, 0, n, n)
    g.fillStyle = `#${accent.getHexString()}`
    g.beginPath(); g.arc(n / 2, n / 2, n / 2, 0, Math.PI * 2); g.fill()
    g.strokeStyle = 'rgba(0,0,0,0.25)'
    g.lineWidth = 6
    g.beginPath(); g.arc(n / 2, n / 2, n * 0.42, 0, Math.PI * 2); g.stroke()
    g.fillStyle = '#1a1410'
    g.textAlign = 'center'
    g.font = '700 54px Unbounded, Manrope, sans-serif'
    g.fillText('SHEROFETCH', n / 2, n * 0.33)
    g.font = '600 30px Manrope, sans-serif'
    g.fillText('SIDE A · 33⅓', n / 2, n * 0.75)
    g.font = '600 34px Manrope, sans-serif'
    const s = line.length > 22 ? `${line.slice(0, 21)}…` : line
    g.fillText(s, n / 2, n * 0.62)
    tex.needsUpdate = true
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  draw(title)
  return { tex, draw }
}

function sleeveTexture(i) {
  const n = 256
  const c = document.createElement('canvas')
  c.width = c.height = n
  const g = c.getContext('2d')
  const hues = [28, 62, 190, 12, 150, 45]
  const h = hues[i % hues.length]
  g.fillStyle = `hsl(${h} 45% 22%)`
  g.fillRect(0, 0, n, n)
  g.fillStyle = `hsl(${h} 70% 58%)`
  if (i % 3 === 0) { g.beginPath(); g.arc(n * 0.5, n * 0.55, n * 0.3, 0, Math.PI * 2); g.fill() }
  else if (i % 3 === 1) { for (let k = 0; k < 6; k++) g.fillRect(n * 0.12, n * (0.15 + k * 0.12), n * (0.3 + 0.4 * Math.abs(Math.sin(k + i))), n * 0.06) }
  else { g.beginPath(); g.moveTo(n * 0.15, n * 0.85); g.lineTo(n * 0.5, n * 0.15); g.lineTo(n * 0.85, n * 0.85); g.fill() }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function mountTurntable(canvas, { onDrawn, onLost } = {}) {
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  } catch { return null }
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const accent = cssColor('--color-accent', '#f0a640')
  const teal = cssColor('--color-seal', '#4cc3b8')
  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.35

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
  const base = new THREE.Vector3(0, 5.6, 8.6)
  camera.position.copy(base)

  // light: one warm spot from above, a cool rim from behind
  const spot = new THREE.SpotLight(0xffe2b8, 140, 30, Math.PI / 6.5, 0.55, 1.6)
  spot.position.set(1.5, 11, 3)
  spot.castShadow = true
  spot.shadow.mapSize.set(1024, 1024)
  spot.shadow.bias = -0.0004
  scene.add(spot, spot.target)
  const rim = new THREE.DirectionalLight(teal, 1.4)
  rim.position.set(-6, 4, -6)
  scene.add(rim, new THREE.AmbientLight(0xffffff, 0.06))

  scene.fog = new THREE.Fog(cssColor('--color-paper', '#121014'), 11, 24)
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: 0x141012, roughness: 0.85 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const deck = new THREE.Group()
  scene.add(deck)
  const plinth = new THREE.Mesh(new RoundedBoxGeometry(6.2, 0.55, 4.7, 4, 0.12), new THREE.MeshPhysicalMaterial({ color: 0x2a1d16, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3 }))
  plinth.position.y = 0.3
  plinth.castShadow = plinth.receiveShadow = true
  deck.add(plinth)
  const platter = new THREE.Mesh(new THREE.CylinderGeometry(2.02, 2.02, 0.16, 96), new THREE.MeshStandardMaterial({ color: 0xb9bcc2, metalness: 0.95, roughness: 0.28 }))
  platter.position.set(-0.55, 0.66, 0)
  platter.castShadow = true
  deck.add(platter)

  const record = new THREE.Group()
  record.position.set(-0.55, 0.76, 0)
  deck.add(record)
  const grooves = grooveTexture()
  const vinyl = new THREE.Mesh(new THREE.CylinderGeometry(1.92, 1.92, 0.04, 128),
    [new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.35 }),
      new THREE.MeshPhysicalMaterial({ map: grooves, roughness: 0.32, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.18 }),
      new THREE.MeshStandardMaterial({ color: 0x0c0c0d })])
  vinyl.castShadow = true
  record.add(vinyl)
  const label = labelTexture(accent, 'Name a song')
  const labelDisc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 64), new THREE.MeshStandardMaterial({ map: label.tex, roughness: 0.6 }))
  labelDisc.rotation.x = -Math.PI / 2
  labelDisc.position.y = 0.022
  labelDisc.scale.x = -1 // the canvas text reads mirrored from above otherwise
  record.add(labelDisc)
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 16), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.2 }))
  spindle.position.y = 0.08
  record.add(spindle)

  // tonearm: pivot at the back right, swings in over the record
  const arm = new THREE.Group()
  arm.position.set(2.15, 0.62, -1.55)
  deck.add(arm)
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8d8dc, metalness: 1, roughness: 0.22 })
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.42, 32), chrome)
  post.position.y = 0.2
  post.castShadow = true
  arm.add(post)
  const swing = new THREE.Group()
  swing.position.y = 0.42
  arm.add(swing)
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.9, 16), chrome)
  tube.rotation.x = Math.PI / 2
  tube.position.z = 1.45
  tube.castShadow = true
  swing.add(tube)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.36), new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.5 }))
  head.position.set(0, -0.04, 2.95)
  head.castShadow = true
  swing.add(head)
  const weight = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.28, 24), chrome)
  weight.rotation.x = Math.PI / 2
  weight.position.z = -0.35
  swing.add(weight)
  const ARM_REST = 0.05, ARM_PLAY = 0.5

  // level meters on the floor around the deck
  const BARS = 72
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 1, 0.14), new THREE.MeshBasicMaterial({ toneMapped: false }), BARS)
  const barColor = new THREE.Color()
  for (let i = 0; i < BARS; i++) bars.setColorAt(i, barColor.copy(accent).lerp(teal, Math.abs(Math.sin((i / BARS) * Math.PI))))
  scene.add(bars)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3()
  const levels = new Float32Array(BARS)

  // album sleeves drifting behind
  const sleeves = []
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshStandardMaterial({ map: sleeveTexture(i), roughness: 0.55, side: THREE.DoubleSide }))
    const a = (i / 6) * Math.PI * 2
    m.userData = { a, r: 7 + (i % 2) * 1.2, y: 2.4 + (i % 3) * 1.1, spin: 0.08 + i * 0.01 }
    scene.add(m)
    sleeves.push(m)
  }

  // state
  let playing = true, armAngle = ARM_REST, spin = 0, scratch = 0, t = 0, kick = 0, beat = 0
  const target = new THREE.Vector2(), look = new THREE.Vector2()
  let dragging = false, lastX = 0, moved = 0
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()

  function onRecord(e) {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    return ray.intersectObject(vinyl).length > 0 || ray.intersectObject(labelDisc).length > 0
  }
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect()
    target.set(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1)
    if (dragging) { const dx = e.clientX - lastX; lastX = e.clientX; moved += Math.abs(dx); scratch = dx * 0.02 }
    canvas.style.cursor = dragging ? 'grabbing' : onRecord(e) ? 'grab' : 'default'
  })
  canvas.addEventListener('pointerdown', (e) => { if (onRecord(e)) { dragging = true; lastX = e.clientX; moved = 0; canvas.setPointerCapture(e.pointerId) } })
  canvas.addEventListener('pointerup', () => {
    if (dragging && moved < 6) playing = !playing
    dragging = false
    scratch = 0
    if (still) frame(0)
  })
  canvas.addEventListener('pointerleave', () => target.set(0, 0))

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    // narrow frames step back so the whole deck stays in view
    camera.fov = w / h < 1 ? 44 : 34
    camera.updateProjectionMatrix()
    if (still) frame(0)
  }

  function frame(dt) {
    t += dt
    // a simple 118 bpm beat while the needle is down
    const bp = (t * 118) / 60
    const phase = bp % 1
    if (playing && Math.floor(bp) !== beat) { beat = Math.floor(bp); kick = 1 }
    kick *= Math.pow(0.02, dt)
    const goal = playing ? ARM_PLAY : ARM_REST
    armAngle += (goal - armAngle) * Math.min(1, dt * 3)
    swing.rotation.y = -armAngle
    swing.rotation.x = playing && Math.abs(armAngle - ARM_PLAY) < 0.02 ? 0.035 : -0.02
    const want = playing ? 33.33 / 60 * Math.PI * 2 : 0
    spin += ((dragging ? 0 : want) - spin) * Math.min(1, dt * (playing ? 2.2 : 1.2))
    record.rotation.y -= spin * dt + scratch
    scratch *= 0.8
    platter.rotation.y = record.rotation.y

    for (let i = 0; i < BARS; i++) {
      const a = (i / BARS) * Math.PI * 2
      const band = 0.5 + 0.5 * Math.sin(i * 0.7 + t * 2.1) * Math.sin(i * 0.23 - t * 1.3)
      const lvl = playing ? 0.12 + band * 0.55 + kick * (i % 4 === 0 ? 0.7 : 0.3) * (1 - phase * 0.3) : 0.05
      levels[i] += (lvl - levels[i]) * Math.min(1, dt * 10)
      p3.set(Math.cos(a) * 5.2, levels[i] / 2, Math.sin(a) * 4.2)
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -a)
      s3.set(1, Math.max(0.04, levels[i]), 1)
      bars.setMatrixAt(i, m4.compose(p3, q, s3))
    }
    bars.instanceMatrix.needsUpdate = true

    for (const m of sleeves) {
      const u = m.userData
      u.a += dt * 0.06
      m.position.set(Math.cos(u.a) * u.r * 1.1, u.y + 0.8 + Math.sin(t * 0.6 + u.a * 3) * 0.25, Math.sin(u.a) * u.r * 0.35 - 7.5)
      m.rotation.y += dt * u.spin
    }

    look.lerp(target, Math.min(1, dt * 2.5))
    camera.position.set(base.x + look.x * 1.6, base.y - look.y * 0.9 + kick * 0.04, base.z)
    camera.lookAt(-0.2, 0.6, 0)
    spot.intensity = 140 + kick * 30
    renderer.render(scene, camera)
  }

  let raf = 0, last = performance.now(), visible = true, running = false, lost = false
  const loop = () => { raf = requestAnimationFrame(loop); const now = performance.now(); frame(Math.min(0.05, (now - last) / 1000)); last = now }
  const sync = () => {
    const go = visible && !document.hidden && !still && !lost
    if (go && !running) { running = true; last = performance.now(); loop() }
    if (!go && running) { running = false; cancelAnimationFrame(raf) }
  }
  new ResizeObserver(resize).observe(canvas)
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync() }).observe(canvas)
  document.addEventListener('visibilitychange', sync)
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; sync(); onLost?.(true) })
  canvas.addEventListener('webglcontextrestored', () => { lost = false; onLost?.(false); sync() })

  resize()
  requestAnimationFrame(() => {
    armAngle = still ? ARM_PLAY : ARM_REST
    frame(still ? 1 : 0)
    onDrawn?.(true)
    sync()
  })

  return {
    typing() { kick = Math.max(kick, 0.5) },
    results(n) { kick = n ? 1 : 0.3; if (!n) label.draw('No match') },
    picked(title) { label.draw(title || 'Up next'); playing = true; if (still) frame(0) },
    needInvite() { label.draw('Invite needed') },
    treat() { kick = 1 },
    runOff() { playing = true; label.draw('Fetching…'); return new Promise((r) => setTimeout(r, still ? 0 : 700)) },
  }
}
