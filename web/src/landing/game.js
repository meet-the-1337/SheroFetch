import * as THREE from 'three'
import { createStage } from '../three/stage.js'
import { createShero, makeBone } from '../three/shero.js'
import { createBubble } from './bubble.js'

const G = 18
const BONE_Y = 0.16
const HOME = new THREE.Vector3(1.9, 0, 2.6)
const BONE_HOME = new THREE.Vector3(0.2, BONE_Y, 3.3)
const FIELD = { x: 8.4, zMin: -13.5, zMax: 4.4 }
const HOUSE = new THREE.Vector3(-4.3, 0, -6.4)
const LINES = { 1: 'Ek aur!', 3: 'Bas itna hi?', 5: 'Tum thak gaye? Main nahi.', 7: 'Ye wala ab mera hai.', 10: 'Cotton ball mode!' }

const angleTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z)
const turn = (cur, want, rate, dt) => {
  let d = want - cur
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return cur + d * (1 - Math.exp(-rate * dt))
}

function readBest() { try { return Number(localStorage.getItem('sf-best')) || 0 } catch { return 0 } }
function writeBest(n) { try { localStorage.setItem('sf-best', String(n)) } catch { /* private mode */ } }

export function mountGame(canvas, { bubbleEl, scoreEl, throwBtn }) {
  const stage = createStage(canvas, { fov: 34, onFrame: (dt) => frame(dt) })
  if (!stage) return null
  const { scene, camera, kit, palette } = stage
  camera.position.set(0, 6.2, 12.6)
  camera.lookAt(0, 0.1, -3.2)

  const pup = createShero(kit, palette)
  pup.root.position.copy(HOME)
  scene.add(pup.root)
  const pupShadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.7), kit.shadow(0.4))
  pupShadow.rotation.x = -Math.PI / 2
  pupShadow.position.y = 0.004
  scene.add(pupShadow)

  const bone = makeBone(kit, kit.fur({ fluff: 0 }), 0.62)
  bone.position.copy(BONE_HOME)
  scene.add(bone)
  const boneShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), kit.shadow(0.35))
  boneShadow.rotation.x = -Math.PI / 2
  boneShadow.position.y = 0.003
  scene.add(boneShadow)

  // Doghouse: red walls, blue roof, a pressed-ink doorway.
  const house = new THREE.Group()
  const walls = kit.drawn(new THREE.BoxGeometry(2.3, 1.7, 2.2), kit.fill(palette.red), { thick: 0.04 })
  walls.position.y = 0.85
  const roofGeo = new THREE.CylinderGeometry(0.01, 1.85, 1.1, 4, 1)
  roofGeo.rotateY(Math.PI / 4)
  const roof = kit.drawn(roofGeo, kit.fill(palette.blue), { thick: 0.04 })
  roof.position.y = 2.24
  roof.scale.set(1, 1, 0.95)
  const door = new THREE.Mesh(new THREE.CircleGeometry(0.52, 28, 0, Math.PI), kit.ink())
  door.position.set(0, 0.2, 1.111)
  const doorLow = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 0.2), kit.ink())
  doorLow.position.set(0, 0.1, 1.111)
  house.add(walls, roof, door, doorLow)
  house.position.copy(HOUSE)
  house.rotation.y = 0.55
  scene.add(house)
  const houseShadow = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.4), kit.shadow(0.4))
  houseShadow.rotation.x = -Math.PI / 2
  houseShadow.position.set(HOUSE.x + 0.4, 0.003, HOUSE.z + 0.2)
  scene.add(houseShadow)

  // A white picket fence marks the back of the yard.
  const fence = new THREE.Group()
  const picket = kit.fur({ fluff: 0 })
  const rail = kit.drawn(new THREE.BoxGeometry(26, 0.16, 0.12), picket, { thick: 0.03 })
  rail.position.set(0, 0.75, 0)
  fence.add(rail)
  for (let x = -12.8; x <= 12.81; x += 0.8) {
    const plank = kit.drawn(new THREE.BoxGeometry(0.34, 1.25, 0.1), picket, { thick: 0.03 })
    plank.position.set(x, 0.62, 0.08)
    fence.add(plank)
  }
  fence.position.z = FIELD.zMin - 0.6
  scene.add(fence)

  // A few crayon tufts so the paper reads as ground.
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 9; i++) {
    const tuft = new THREE.Mesh(new THREE.PlaneGeometry(0.9 + rnd(), 0.35 + rnd() * 0.3), kit.shadow(0.22))
    tuft.rotation.x = -Math.PI / 2
    tuft.position.set((rnd() - 0.5) * 15, 0.002, -13 + rnd() * 15)
    scene.add(tuft)
  }

  const bubble = createBubble(bubbleEl, canvas, camera, pup.headPivot)
  const vel = new THREE.Vector3()
  let state = 'ready', count = 0, best = readBest(), reactIn = 0, curlSpin = 0, note = ''

  const setScore = () => {
    scoreEl.textContent = count === 0 ? 'No throws yet.' : `${count} ${count === 1 ? 'fetch' : 'fetches'} this visit. Best run: ${Math.max(best, count)}.`
  }
  setScore()

  function landBone() {
    bone.position.y = BONE_Y
    vel.set(0, 0, 0)
    const out = Math.abs(bone.position.x) > FIELD.x || bone.position.z < FIELD.zMin
    bone.position.x = Math.max(-FIELD.x, Math.min(FIELD.x, bone.position.x))
    bone.position.z = Math.max(FIELD.zMin, Math.min(FIELD.zMax, bone.position.z))
    if (out) note = 'Kahaan phenka, bhai?'
    if (bone.position.distanceTo(HOUSE) < 1.6) {
      note = 'Ghar mein? Hoshiyaar.'
      bone.position.set(HOUSE.x + Math.sin(0.55) * 1.6, BONE_Y, HOUSE.z + Math.cos(0.55) * 1.6)
    }
  }

  function throwBone(v) {
    if (state !== 'ready' && state !== 'held') return
    vel.copy(v)
    state = 'flying'
    reactIn = 0.3
    note = ''
    if (stage.still) {
      // Reduced motion: no flight, no chase. The bone lands where it would have, and comes back.
      const t = (v.y + Math.sqrt(v.y * v.y + 2 * G * (bone.position.y - BONE_Y))) / G
      bone.position.addScaledVector(new THREE.Vector3(v.x, 0, v.z), t * 1.35)
      landBone()
      finish()
      stage.poke(0.1)
    }
  }

  function finish() {
    if (bone.parent !== scene) scene.attach(bone)
    bone.position.copy(BONE_HOME)
    bone.rotation.set(0, 0, 0)
    bone.scale.setScalar(1)
    pup.root.position.copy(HOME)
    pup.root.rotation.y = 0
    pup.setRunning(false)
    pup.setCurl(false)
    count += 1
    if (count > best) { best = count; writeBest(best) }
    setScore()
    const line = note || LINES[count]
    if (line) bubble.say(line)
    pup.pet()
    state = 'ready'
  }

  function frame(dt) {
    if (state === 'flying') {
      vel.y -= G * dt
      bone.position.addScaledVector(vel, dt)
      bone.rotation.x += dt * 9
      bone.rotation.z += dt * 4
      if (bone.position.y <= BONE_Y) {
        if (Math.abs(vel.y) > 2) { bone.position.y = BONE_Y; vel.y = -vel.y * 0.36; vel.x *= 0.62; vel.z *= 0.62 }
        else { state = 'rolling'; vel.y = 0; bone.position.y = BONE_Y }
      }
    } else if (state === 'rolling') {
      vel.multiplyScalar(Math.exp(-dt * 3.4))
      bone.position.addScaledVector(vel, dt)
      bone.rotation.x += vel.length() * dt * 2
      if (vel.length() < 0.2 || Math.abs(bone.position.x) > FIELD.x || bone.position.z < FIELD.zMin) { landBone(); bone.rotation.set(0, bone.rotation.y, 0); state = 'chase' }
    }

    const chasing = state === 'flying' || state === 'rolling' || state === 'chase'
    if (chasing) {
      reactIn -= dt
      if (reactIn <= 0) {
        const target = bone.position
        pup.root.rotation.y = turn(pup.root.rotation.y, angleTo(pup.root.position, target), 9, dt)
        const dist = Math.hypot(target.x - pup.root.position.x, target.z - pup.root.position.z)
        const pace = state === 'chase' ? Math.min(7.5, 1.5 + dist * 2.2) : 6
        pup.setRunning(true)
        if (dist > 0.85) {
          pup.root.position.x += Math.sin(pup.root.rotation.y) * pace * dt
          pup.root.position.z += Math.cos(pup.root.rotation.y) * pace * dt
        } else if (state === 'chase') {
          pup.socket.add(bone)
          bone.position.set(0, -0.04, 0.06)
          bone.rotation.set(0, 0, 0)
          bone.scale.setScalar(0.7)
          state = 'carry'
          if (count + 1 === 10) pup.setCurl(true)
        }
      }
    } else if (state === 'carry') {
      const dist = Math.hypot(HOME.x - pup.root.position.x, HOME.z - pup.root.position.z)
      if (dist > 0.35) {
        pup.root.rotation.y = turn(pup.root.rotation.y, angleTo(pup.root.position, HOME), 9, dt)
        const pace = Math.min(7, 1.2 + dist * 2)
        pup.root.position.x += Math.sin(pup.root.rotation.y) * pace * dt
        pup.root.position.z += Math.cos(pup.root.rotation.y) * pace * dt
      } else {
        finish()
      }
    } else if (state === 'ready') {
      pup.root.rotation.y = turn(pup.root.rotation.y, 0, 6, dt)
    }

    pup.update(dt)
    if (pup.state.curl > 0.3) { curlSpin += dt * 9; pup.rig.rotation.x = curlSpin } else curlSpin = 0
    pupShadow.position.x = pup.root.position.x
    pupShadow.position.z = pup.root.position.z
    boneShadow.visible = bone.parent === scene
    boneShadow.position.x = bone.position.x
    boneShadow.position.z = bone.position.z
    bubble.place()
  }

  // Grab the bone, drag, let go: the flick sets the throw.
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.7)
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const hit = new THREE.Vector3()
  const toNdc = (e) => {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    return r
  }
  let samples = []
  canvas.addEventListener('pointerdown', (e) => {
    if (state !== 'ready') return
    toNdc(e)
    ray.setFromCamera(ndc, camera)
    const near = ray.intersectObject(bone, true).length > 0
    const p = bone.position.clone().project(camera)
    const r = canvas.getBoundingClientRect()
    const dx = ((p.x * 0.5 + 0.5) * r.width) - (e.clientX - r.left)
    const dy = ((-p.y * 0.5 + 0.5) * r.height) - (e.clientY - r.top)
    if (!near && Math.hypot(dx, dy) > 70) return
    state = 'held'
    samples = [{ x: e.clientX, y: e.clientY, t: performance.now() }]
    canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (state !== 'held') return
    toNdc(e)
    ray.setFromCamera(ndc, camera)
    if (ray.ray.intersectPlane(plane, hit)) {
      bone.position.set(Math.max(-4, Math.min(4, hit.x)), 0.7, Math.max(1.2, Math.min(4.4, hit.z)))
    }
    samples.push({ x: e.clientX, y: e.clientY, t: performance.now() })
    if (samples.length > 8) samples.shift()
    stage.poke(0.05)
  })
  canvas.addEventListener('pointerup', (e) => {
    if (state !== 'held') return
    const now = performance.now()
    const recent = samples.filter((s) => now - s.t < 120)
    const a = recent[0] || samples[0], b = { x: e.clientX, y: e.clientY, t: now }
    const dt = Math.max(16, b.t - a.t) / 1000
    const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt
    const forward = Math.max(0, Math.min(17, -vy * 0.011))
    if (forward < 2.2) { bone.position.copy(BONE_HOME); state = 'ready'; stage.poke(0.1); return }
    throwBone(new THREE.Vector3(Math.max(-7, Math.min(7, vx * 0.006)), 4.2 + forward * 0.38, -forward))
  })
  canvas.addEventListener('pointercancel', () => { if (state === 'held') { bone.position.copy(BONE_HOME); state = 'ready' } })

  throwBtn.addEventListener('click', () => {
    if (state !== 'ready') return
    const forward = 8 + Math.random() * 8
    throwBone(new THREE.Vector3((Math.random() - 0.5) * 8, 4.2 + forward * 0.38, -forward))
  })

  return { stage }
}
