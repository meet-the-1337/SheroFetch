import * as THREE from 'three'
import { createStage } from '../three/stage.js'
import { createShero } from '../three/shero.js'
import { createBubble, pickLine } from './bubble.js'

const PET = ['Hehe, aur karo!', 'Wahi wala spot!', 'Pyaar se, pyaar se.']
const SPIN = ['Chakkar aa gaya…', 'Phir se!', 'Duniya ghoom rahi hai.']

export function mountHero(canvas, bubbleEl) {
  let pup, bubble
  let mode = 'idle', runResolve = null, speed = 0, greeted = false
  const stage = createStage(canvas, { fov: 27, onFrame: (dt) => frame(dt) })
  if (!stage) return null
  const { scene, camera, kit, palette } = stage

  camera.position.set(0.45, 2.0, 7.0)
  camera.lookAt(0, 1.02, 0)
  pup = createShero(kit, palette)
  pup.root.rotation.y = -0.26
  scene.add(pup.root)
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.9), kit.shadow(0.45))
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.004
  scene.add(shadow)
  bubble = createBubble(bubbleEl, canvas, camera, pup.headPivot)

  function frame(dt) {
    if (mode === 'run') {
      speed = Math.min(6, speed + dt * 10)
      const want = Math.PI / 2
      pup.root.rotation.y += (want - pup.root.rotation.y) * (1 - Math.exp(-dt * 9))
      pup.root.position.x += speed * dt
      if (pup.root.position.x > 5.2) { mode = 'gone'; runResolve?.(); runResolve = null }
    }
    shadow.position.x = pup.root.position.x
    pup.update(dt)
    bubble.place()
  }

  const head = new THREE.Vector3()
  const onLook = (e) => {
    if (mode !== 'idle') return
    const r = canvas.getBoundingClientRect()
    pup.headPivot.getWorldPosition(head)
    head.project(camera)
    const hx = r.left + (head.x * 0.5 + 0.5) * r.width
    const hy = r.top + (-head.y * 0.5 + 0.5) * r.height
    pup.lookAt((e.clientX - hx) / (r.width * 0.55), -(e.clientY - hy) / (r.height * 0.55))
    stage.poke(0.2)
  }
  window.addEventListener('pointermove', onLook, { passive: true })

  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const hitsPup = (e) => {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    return ray.intersectObject(pup.root, true).length > 0
  }
  let down = null
  canvas.addEventListener('pointerenter', () => {
    if (!greeted && mode === 'idle') { greeted = true; bubble.say('Bolo, kaunsa gaana?') }
  })
  canvas.addEventListener('pointerdown', (e) => {
    if (mode !== 'idle') return
    down = { x: e.clientX, last: e.clientX, dragged: false, onPup: hitsPup(e) }
    canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!down) return
    const dx = e.clientX - down.last
    down.last = e.clientX
    if (Math.abs(e.clientX - down.x) > 6) down.dragged = true
    if (down.dragged) { pup.root.rotation.y += dx * 0.012; pup.state.spinVel = dx * 0.6; stage.poke(0.1) }
  })
  const release = () => {
    if (!down) return
    if (down.dragged) { if (Math.abs(pup.state.spinVel) > 6) bubble.say(pickLine(SPIN)) }
    else if (down.onPup) { pup.pet(); bubble.say(pickLine(PET)) }
    stage.poke(1.2)
    down = null
  }
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', () => { down = null })

  return {
    typing() { if (mode === 'idle') { pup.perk(); stage.poke(0.6) } },
    results(n) {
      if (mode !== 'idle') return
      pup.sniff()
      bubble.say(n ? 'Sniff sniff… ye wala?' : 'Kuch nahi mila. Spelling dekho?')
      stage.poke(1.5)
    },
    needInvite() { pup.sniff(); bubble.say('Pehle invite dikhao!', 3200); stage.poke(1.5) },
    treat() { pup.pet(); pup.pet(); bubble.say('Chocobi! Mera favourite.', 3000); stage.poke(1.5) },
    // Shero runs off screen to fetch. Resolves once he is gone (at once under reduced motion).
    runOff() {
      if (stage.still) return Promise.resolve()
      bubble.say('Abhi laaya!', 1200)
      pup.setRunning(true)
      mode = 'run'
      speed = 0
      return new Promise((resolve) => { runResolve = resolve })
    },
  }
}
