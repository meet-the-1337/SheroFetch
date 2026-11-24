import * as THREE from 'three'
import { readPalette } from './color.js'
import { createCrayonKit } from './crayon.js'

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// One crayon-drawn WebGL stage bound to a canvas: sizing, pixel ratio, pausing off-screen,
// and the stepped "line boil" that makes the drawing look hand-animated at 8 frames a second.
export function createStage(canvas, { fov = 32, onFrame, maxDpr = 2 } = {}) {
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
  } catch {
    return null
  }
  renderer.setClearColor(0x000000, 0)
  const palette = readPalette()
  const dpr = () => Math.min(window.devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : maxDpr)
  const kit = createCrayonKit(palette, { dpr: dpr() })
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100)
  let last = performance.now()
  let running = false, visible = false, raf = 0, still = reducedMotion(), ready = false
  let boilTimer = 0, boil = 0

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight
    if (!w || !h) return
    const r = dpr()
    renderer.setPixelRatio(r)
    renderer.setSize(w, h, false)
    kit.setDpr(r)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    if (!running && ready) render(0)
  }

  const render = (dt) => {
    if (!still) {
      boilTimer += dt
      if (boilTimer > 0.125) { boilTimer = 0; boil = (boil + 1) % 64; kit.setBoil(boil) }
    }
    onFrame?.(dt, { still })
    renderer.render(scene, camera)
  }

  const loop = () => {
    raf = requestAnimationFrame(loop)
    const now = performance.now()
    render(Math.min((now - last) / 1000, 0.05))
    last = now
  }
  const sync = () => {
    const should = ready && visible && !document.hidden && !still
    if (should && !running) { running = true; last = performance.now(); loop() }
    if (!should && running) { running = false; cancelAnimationFrame(raf) }
  }

  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync() })
  io.observe(canvas)
  document.addEventListener('visibilitychange', sync)
  const mq = matchMedia('(prefers-reduced-motion: reduce)')
  mq.addEventListener('change', () => { still = mq.matches; sync(); if (still) render(0) })

  resize()
  // The caller finishes building its scene in this same task; draw from the next frame on.
  requestAnimationFrame(() => { ready = true; render(0); sync() })
  return {
    renderer, scene, camera, kit, palette,
    get still() { return still },
    // Under reduced motion nothing loops; interactions ask for one frame at a time.
    poke(seconds = 0) {
      if (!still) return
      const end = performance.now() + seconds * 1000
      const step = () => { render(1 / 60); if (performance.now() < end) requestAnimationFrame(step) }
      step()
    },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect()
      document.removeEventListener('visibilitychange', sync)
      kit.dispose(); renderer.dispose()
    },
  }
}
