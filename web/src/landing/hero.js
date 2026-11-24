import * as THREE from 'three'
import { createStage } from '../three/stage.js'
import { createShero, makeBone } from '../three/shero.js'
import { createYard, createRoom } from '../three/yard.js'
import { createKid } from '../three/kid.js'
import { createBubble, pickLine } from './bubble.js'
import { createStoryTour } from '../three/story.js'

const PET = ['Hehe, aur karo!', 'Wahi wala spot!', 'Pyaar se, pyaar se.']
const SPIN = ['Chakkar aa gaya…', 'Phir se!', 'Duniya ghoom rahi hai.']
const TV = [
  ['Channel Shero', 'Kya sunoge?'],
  ['Tonight', 'Gaana raat'],
  ['Weather', 'Dhoop, phir gaane'],
  ['News', 'Kutta gaana laaya'],
  ['Action Kamen', 'Action Beam!', true],
]
const HERO_LINES = ['WAHAHAHA! Action Beam!', 'Action Kamen Z!', 'Buri Buri Zaemon ko hara diya! Hahaha!']
const KID_TEASE = ['Mummy ko mat batana!', 'Shero ko ghumane le jaana bhool gaya...', 'Hehehe! Dekho mera Buri-Buri boogie!', 'Action Kamen ki nayi movie aa rahi hai!']
const DANCE_LINES = ['Buri Buri Boogie! (ケツだけ星人)', 'Sharmao mat, naacho naacho!', 'Dekho mera Buri-Buri step!']
const BONE_LINES = ['Laaya! Phir se phenko!', 'Mil gaya! Aur?', 'Haddi meri hai, ab.']
const ROOM_X = 80
const VIEWS = {
  yard: { pos: new THREE.Vector3(1.2, 2.9, 15), look: new THREE.Vector3(0, 2.7, -3) },
  room: { pos: new THREE.Vector3(ROOM_X + 1.0, 4.2, 14.5), look: new THREE.Vector3(ROOM_X + 0.7, 1.9, -0.6) },
  overview: { pos: new THREE.Vector3(3.5, 7.5, 22), look: new THREE.Vector3(0.5, 2.8, -4) },
}
const YARD_SPOT = new THREE.Vector3(1.5, 0, 2.6)
const KID_YARD = new THREE.Vector3(3.3, 0, 1.4)
const KID_ROOM = new THREE.Vector3(ROOM_X - 1.6, 0, 2.0)
const KID_LINES = ['Shero, gaana le aa!', 'Mera kutta sabse smart hai.', 'Homework baad mein, gaana pehle!', 'Hehe, ek aur gaana?', ...KID_TEASE]
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export function mountHero(canvas, bubbleEl, { onDrawn, onLost, houseBtn, storyBtn, onPlace } = {}) {
  let mode = 'idle', place = 'yard', runResolve = null, speed = 0, greeted = false, tvAt = 0
  let tween = null, yaw = 0, yawVel = 0
  // 1.5x is plenty for a crayon drawing and halves the GPU work of a 2x screen.
  const stage = createStage(canvas, { fov: 30, maxDpr: 1.5, onFrame: (dt) => frame(dt), onDrawn, onLost })
  if (!stage) return null
  const { scene, camera, kit, palette } = stage

  const yard = createYard(kit, palette)
  scene.add(yard.root)
  const room = createRoom(kit, palette)
  room.root.position.x = ROOM_X
  room.root.visible = false // only one place is drawn at a time
  scene.add(room.root)
  const pup = createShero(kit, palette)
  pup.root.position.copy(YARD_SPOT)
  pup.root.rotation.y = -0.32
  scene.add(pup.root)
  const kid = createKid(kit, palette)
  kid.root.position.copy(KID_YARD)
  kid.root.rotation.y = -0.5
  scene.add(kid.root)
  const kidShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), kit.shadow(0.4))
  kidShadow.rotation.x = -Math.PI / 2
  scene.add(kidShadow)
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.9), kit.shadow(0.45))
  shadow.rotation.x = -Math.PI / 2
  scene.add(shadow)
  const bubble = createBubble(bubbleEl, canvas, camera, pup.headPivot)

  // Shero walking somewhere on his own (to a thrown bone, to his bowl, and back).
  let walk = null
  const walkTo = (to, pace = 5) => new Promise((resolve) => {
    if (stage.still) { pup.root.position.set(to.x, 0, to.z); resolve(); return }
    pup.setRunning(true)
    walk = { to: new THREE.Vector3(to.x, 0, to.z), pace, resolve }
  })
  const bone = makeBone(kit, kit.fur({ fluff: 0 }), 0.7)
  bone.visible = false
  scene.add(bone)
  let flight = null

  const look = new THREE.Vector3()
  const setView = (v) => { camera.position.copy(v.pos); look.copy(v.look); camera.lookAt(look) }
  setView(VIEWS.yard)

  function frame(dt) {
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / tween.dur)
      const k = ease(tween.t)
      camera.position.lerpVectors(tween.from.pos, tween.to.pos, k)
      look.lerpVectors(tween.from.look, tween.to.look, k)
      if (tween.pup) pup.root.position.lerpVectors(tween.pup[0], tween.pup[1], k)
      if (tween.t >= 1) { const done = tween.done; tween = null; done?.() }
    } else if (place === 'room') {
      // Inside, dragging turns your head around the room.
      yaw += yawVel * dt
      yawVel *= Math.exp(-dt * 4)
      yaw = Math.max(-0.2, Math.min(0.2, yaw)) // the camera stays between the side walls
      const base = VIEWS.room
      const r = base.pos.z - base.look.z
      camera.position.set(base.look.x + Math.sin(yaw) * r + 0.3, base.pos.y, base.look.z + Math.cos(yaw) * r)
      look.copy(base.look)
    }
    camera.lookAt(look)
    if (mode === 'run') {
      speed = Math.min(6, speed + dt * 10)
      pup.root.rotation.y += (Math.PI / 2 - pup.root.rotation.y) * (1 - Math.exp(-dt * 9))
      pup.root.position.x += speed * dt
      const edge = (place === 'room' ? ROOM_X : 0) + 7.5
      if (pup.root.position.x > edge) { mode = 'gone'; runResolve?.(); runResolve = null }
    }
    if (walk) {
      const p = pup.root.position
      const dx = walk.to.x - p.x, dz = walk.to.z - p.z
      const d = Math.hypot(dx, dz)
      const want = Math.atan2(dx, dz)
      let turn = want - pup.root.rotation.y
      turn = Math.atan2(Math.sin(turn), Math.cos(turn))
      pup.root.rotation.y += turn * (1 - Math.exp(-dt * 10))
      if (d < 0.12) { const w = walk; walk = null; pup.setRunning(false); w.resolve() }
      else { const step = Math.min(d, walk.pace * dt); p.x += (dx / d) * step; p.z += (dz / d) * step }
    }
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / flight.dur)
      const k = flight.t
      bone.position.lerpVectors(flight.from, flight.to, k)
      bone.position.y += Math.sin(k * Math.PI) * flight.arc
      bone.rotation.z += dt * 14
      if (k >= 1) { const f = flight; flight = null; bone.position.y = 0.12; bone.rotation.set(Math.PI / 2, 0, Math.random() * 3); f.done() }
    }
    shadow.position.set(pup.root.position.x, pup.root.position.y + 0.004, pup.root.position.z)
    kidShadow.position.set(kid.root.position.x, 0.004, kid.root.position.z)
    kid.update(dt)
    pup.update(dt)
    bubble.place()
  }

  // Fade the drawing out and back in around a cut, like turning a page.
  const cut = (fn) => new Promise((resolve) => {
    canvas.classList.add('is-cut')
    setTimeout(() => { fn(); stage.poke(0.3); canvas.classList.remove('is-cut'); setTimeout(resolve, 240) }, 240)
  })
  const syncButton = () => {
    if (houseBtn) {
      houseBtn.textContent = place === 'yard' ? 'Go inside the house' : 'Back to the yard'
      houseBtn.disabled = mode !== 'idle'
    }
    if (storyBtn) {
      storyBtn.disabled = mode !== 'idle' && !story.isRunning()
    }
    onPlace?.(place)
  }

  const story = createStoryTour({
    stage,
    yard,
    room,
    pup,
    kid,
    bubble,
    setPlace: async (p) => {
      if (p === 'room' && place !== 'room') await goInside()
      else if (p === 'yard' && place !== 'yard') await goOutside()
    },
    setView,
    ROOM_X,
    VIEWS,
  })

  storyBtn?.addEventListener('click', async () => {
    if (story.isRunning()) {
      story.stop()
      storyBtn.textContent = '🎬 House Story Tour'
      syncButton()
    } else {
      storyBtn.textContent = '⏹ Stop Tour'
      syncButton()
      await story.start()
      storyBtn.textContent = '🎬 House Story Tour'
      syncButton()
    }
  })

  async function goInside() {
    if (mode !== 'idle' || place !== 'yard') return
    mode = 'travel'
    syncButton()
    bubble.say('Chalo andar!', 1400)
    const door = yard.doorWorld()
    if (!stage.still) {
      pup.setRunning(true)
      pup.root.rotation.y = Math.atan2(door.x - pup.root.position.x, door.z - pup.root.position.z)
      await new Promise((done) => {
        tween = {
          t: 0, dur: 1.3, done,
          from: { pos: camera.position.clone(), look: look.clone() },
          to: { pos: door.clone().add(new THREE.Vector3(0, 1.2, 4.2)), look: door.clone().add(new THREE.Vector3(0, 1, 0)) },
          pup: [pup.root.position.clone(), new THREE.Vector3(door.x, 0, door.z + 0.6)],
        }
      })
      pup.setRunning(false)
    }
    await cut(() => {
      place = 'room'
      yard.root.visible = false
      room.root.visible = true
      yaw = 0.06
      yawVel = 0
      setView(VIEWS.room)
      pup.root.position.copy(room.spot).add(room.root.position)
      pup.root.rotation.y = 0.35
      kid.root.position.copy(KID_ROOM)
      kid.root.rotation.y = 0.5
    })
    mode = 'idle'
    syncButton()
    bubble.say('Ghar aa gaye! TV pe tap karo.', 2600)
  }

  async function goOutside() {
    if (mode !== 'idle' || place !== 'room') return
    mode = 'travel'
    syncButton()
    await cut(() => {
      place = 'yard'
      yard.root.visible = true
      room.root.visible = false
      setView(VIEWS.yard)
      pup.root.position.copy(YARD_SPOT)
      pup.root.rotation.y = -0.32
      kid.root.position.copy(KID_YARD)
      kid.root.rotation.y = -0.5
    })
    mode = 'idle'
    syncButton()
    bubble.say('Bahar ki hawa!', 1600)
  }
  // Tap the yard: the bone flies there, Shero fetches it in his mouth and brings it back.
  async function tossBone(point) {
    if (mode !== 'idle' || place !== 'yard') return
    mode = 'play'
    syncButton()
    const to = new THREE.Vector3(Math.max(-6, Math.min(6.5, point.x)), 0.12, Math.max(-3, Math.min(5, point.z)))
    const home = pup.root.position.clone()
    bone.visible = true
    scene.add(bone)
    pup.perk()
    await new Promise((done) => {
      if (stage.still) { bone.position.copy(to); done(); return }
      flight = { t: 0, dur: 0.75, from: new THREE.Vector3(2.6, 1.6, 4.4), to, arc: 2.2, done }
    })
    bubble.say('Haddi!', 900)
    await walkTo(to.clone().sub(new THREE.Vector3(0, 0, 0.6)), 6.5)
    pup.socket.add(bone)
    bone.position.set(0, 0, 0)
    bone.rotation.set(0, Math.PI / 2, 0)
    await walkTo(home, 5)
    pup.root.rotation.y = -0.32
    scene.add(bone)
    bone.position.set(home.x - 0.9, 0.12, home.z + 0.5)
    bone.rotation.set(Math.PI / 2, 0, 0.4)
    pup.pet()
    bubble.say(pickLine(BONE_LINES), 2200)
    stage.poke(1.4)
    mode = 'idle'
    syncButton()
  }

  // Tap the bowl: dinner time.
  async function dinner() {
    if (mode !== 'idle') return
    mode = 'play'
    syncButton()
    const home = pup.root.position.clone()
    const b = yard.bowlWorld()
    bubble.say('Khaana!', 900)
    await walkTo(new THREE.Vector3(b.x + 0.1, 0, b.z + 1.0), 5.5)
    pup.root.rotation.y = Math.PI
    pup.eat(2.4)
    bubble.say('Crunch crunch crunch…', 2200)
    stage.poke(2.6)
    await new Promise((r) => setTimeout(r, stage.still ? 0 : 2500))
    await walkTo(home, 4.5)
    pup.root.rotation.y = -0.32
    pup.pet()
    bubble.say('Pet bhar gaya. Ab gaana?', 2000)
    mode = 'idle'
    syncButton()
  }

  // A link straight into the living room: /#inside
  if (location.hash === '#inside') setTimeout(goInside, 400)
  houseBtn?.addEventListener('click', () => (place === 'yard' ? goInside() : goOutside()))
  syncButton()

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
  const aim = (e) => {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
  }
  const hits = (obj) => ray.intersectObject(obj, true).length > 0
  const hitsPup = (e) => { aim(e); return hits(pup.root) }

  let down = null
  canvas.addEventListener('pointerenter', () => {
    if (!greeted && mode === 'idle') { greeted = true; bubble.say('Bolo, kaunsa gaana? Darwaza bhi khula hai.') }
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
    if (!down.dragged) return
    if (place === 'room' && !down.onPup) { yaw -= dx * 0.004; yawVel = -dx * 0.25 }
    else { pup.root.rotation.y += dx * 0.012; pup.state.spinVel = dx * 0.6 }
    stage.poke(0.3)
  })
  const release = (e) => {
    if (!down) return
    const tap = !down.dragged
    if (!tap) { if (Math.abs(pup.state.spinVel) > 6) bubble.say(pickLine(SPIN)) }
    else if (down.onPup) { pup.pet(); bubble.say(pickLine(PET)) }
    else {
      aim(e)
      if (hits(kid.root)) { kid.wave(); bubble.say(pickLine(KID_LINES), 2400) }
      else if (place === 'yard' && hits(yard.bowl)) dinner()
      else if (place === 'yard' && yard.waterDish && hits(yard.waterDish)) { pup.sniff(); bubble.say('Slurp slurp... Thanda paani!', 2000) }
      else if (place === 'yard' && yard.plate && hits(yard.plate)) bubble.say('Nohara (野原) family residence! Kasukabe, Saitama.', 2600)
      else if (place === 'yard' && yard.car && hits(yard.car)) bubble.say('Hiroshi papa ki gaadi! 32 saal ka loan chal raha hai!', 2800)
      else if (place === 'yard' && (hits(yard.door) || hits(yard.house))) goInside()
      else if (place === 'yard' && hits(yard.doghouse)) { pup.perk(); bubble.say('Ye mera ghar hai. Chhota, par mera.', 2400) }
      else if (place === 'yard' && hits(yard.trike)) bubble.say('Shinchan ki laal tricycle! Fast drive!', 2500)
      else if (place === 'yard' && hits(yard.mailbox)) { pup.perk(); bubble.say('Chitthi aayi? Shayad gaana aaya!', 2400) }
      else if (place === 'yard') {
        const g = ray.intersectObject(yard.ground)[0]
        if (g) tossBone(g.point)
      }
      else if (place === 'room' && hits(room.tv)) {
        tvAt = (tvAt + 1) % TV.length
        room.setScreen(...TV[tvAt])
        if (TV[tvAt][2]) { kid.actionPose(); bubble.say(pickLine(HERO_LINES), 2800) } else bubble.say('Channel badlo, gaana wahi!', 1800)
      } else if (place === 'room' && room.comic && hits(room.comic)) { kid.actionPose(); bubble.say('Action Kamen comic volume 15! Action Beam!', 2800) }
      else if (place === 'room' && room.phone && hits(room.phone)) bubble.say('Trrring! "Moshi moshi, Nohara family residence desu!"', 2600)
      else if (place === 'room' && (hits(room.snack) || hits(room.pot))) { pup.beg(); bubble.say('Chocobi! Ya fir garam chai?', 2600) }
      else if (place === 'room' && hits(room.crayons)) bubble.say('Crayon se hi toh bana hoon!', 2200)
      else if (place === 'room' && hits(room.sofa)) bubble.say('Sofa pe allowed nahi hoon. Shh.', 2200)
    }
    stage.poke(1.2)
    down = null
  }
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', () => { down = null })
  // Double-tap: the cotton-candy trick, curled into a ball of fluff.
  let curlTimer = 0
  canvas.addEventListener('dblclick', (e) => {
    if (mode !== 'idle') return
    if (!hitsPup(e)) {
      if (hits(kid.root)) { kid.dance(); pup.pet(); bubble.say('Buri Buri Boogie! (ケツだけ星人) Naacho naacho!', 2600); stage.poke(2.8) }
      return
    }
    pup.setCurl(true)
    bubble.say('Watagashi!', 1800)
    stage.poke(2.4)
    clearTimeout(curlTimer)
    curlTimer = setTimeout(() => { pup.setCurl(false); stage.poke(1.2) }, 1700)
  })

  return {
    typing() { if (mode === 'idle') { pup.perk(); stage.poke(0.6) } },
    results(n) {
      if (mode !== 'idle') return
      pup.sniff()
      bubble.say(n ? 'Sniff sniff… ye wala?' : 'Kuch nahi mila. Spelling dekho?')
      stage.poke(1.5)
    },
    picked(title) { room.setScreen('Up next', title || 'Gaana') },
    needInvite() { pup.sniff(); bubble.say('Pehle invite dikhao!', 3200); stage.poke(1.5) },
    treat() { pup.beg(3); bubble.say('Snack? Main baith ke maangta hoon!', 3000); stage.poke(3) },
    // Shero runs off screen to fetch. Resolves once he is gone (at once under reduced motion).
    runOff() {
      if (stage.still || mode !== 'idle') return Promise.resolve()
      bubble.say('Abhi laaya!', 1200)
      pup.setRunning(true)
      mode = 'run'
      speed = 0
      return new Promise((resolve) => { runResolve = resolve })
    },
  }
}
