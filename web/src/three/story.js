import * as THREE from 'three'

// Guided Story & Explainer Walkthrough for the Nohara Family Residence & Characters.
// Tours through the Kasukabe street gate, Shiro's yard & tricks, the Engawa veranda,
// the tatami living room with Chocobi, Action Kamen on CRT TV, and the Buri-Buri boogie!

export function createStoryTour({
  stage,
  yard,
  room,
  pup,
  kid,
  bubble,
  setPlace,
  setView,
  ROOM_X,
  VIEWS,
}) {
  let running = false
  let cancelled = false
  let currentStep = -1

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, stage.still ? 50 : ms))

  const tweenCamera = (fromPos, toPos, fromLook, toLook, dur = 2.0) =>
    new Promise((resolve) => {
      if (stage.still || cancelled) {
        stage.camera.position.copy(toPos)
        stage.camera.lookAt(toLook)
        resolve()
        return
      }
      const t0 = performance.now()
      const startPos = fromPos.clone()
      const endPos = toPos.clone()
      const startLook = fromLook.clone()
      const endLook = toLook.clone()
      const curLook = new THREE.Vector3()

      function step() {
        if (cancelled) { resolve(); return }
        const elapsed = (performance.now() - t0) / 1000
        const progress = Math.min(1, elapsed / dur)
        // smooth cubic ease
        const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2
        stage.camera.position.lerpVectors(startPos, endPos, ease)
        curLook.lerpVectors(startLook, endLook, ease)
        stage.camera.lookAt(curLook)
        stage.poke(0.2)
        if (progress < 1) requestAnimationFrame(step)
        else resolve()
      }
      requestAnimationFrame(step)
    })

  async function start() {
    if (running) return
    running = true
    cancelled = false
    currentStep = 0

    try {
      // --- ACT 1: Kasukabe Arrival & Front Gate ---
      await setPlace('yard')
      kid.root.position.set(2.4, 0, -1.8)
      kid.root.rotation.y = -0.5
      pup.root.position.set(0.6, 0, 1.8)

      const p1Start = new THREE.Vector3(2.8, 3.2, 10.0)
      const p1End = new THREE.Vector3(1.6, 1.8, 3.8)
      const l1 = new THREE.Vector3(1.4, 1.2, 0.1)

      bubble.say('Welcome to 2-chome Kasukabe, Saitama! The iconic 2-storey Nohara house.', 3600)
      await tweenCamera(p1Start, p1End, new THREE.Vector3(0, 1.8, -4), l1, 2.2)
      if (cancelled) return

      kid.wave()
      bubble.say('Shinchan: "Tadaima! ... Arre nahi, Okaeri bolna tha!"', 3800)
      await sleep(3800)
      if (cancelled) return

      // --- ACT 2: Shiro's Corner & Tricks ---
      currentStep = 1
      const p2 = new THREE.Vector3(-0.6, 1.7, 2.4)
      const l2 = new THREE.Vector3(-1.9, 0.85, -0.2)
      bubble.say('Meet Shiro, the smartest pup in anime! Shinchan often forgets to feed him...', 3800)
      await tweenCamera(stage.camera.position, p2, l1, l2, 2.0)
      if (cancelled) return

      pup.root.position.set(-1.2, 0, 0.6)
      pup.root.rotation.y = Math.PI / 4
      pup.beg(2.8)
      bubble.say('Shiro sits up on his hind legs begging for treats (Chin-chin trick)!', 3200)
      await sleep(3200)
      if (cancelled) return

      pup.setCurl(true)
      bubble.say('Watagashi! Shiro curls into a pure fluffy cotton-candy ball.', 3200)
      await sleep(2600)
      pup.setCurl(false)
      if (cancelled) return

      // --- ACT 3: Engawa Veranda & Balcony Laundry ---
      currentStep = 2
      const p3 = new THREE.Vector3(-0.4, 2.8, 6.2)
      const l3 = new THREE.Vector3(-0.8, 1.8, 2.0)
      bubble.say('The wooden Engawa veranda connects the yard straight into the tatami room.', 3800)
      await tweenCamera(stage.camera.position, p3, l2, l3, 2.2)
      if (cancelled) return
      await sleep(3000)
      if (cancelled) return

      // --- ACT 4: The Tatami Living Room & Chocobi ---
      currentStep = 3
      await setPlace('room')
      pup.root.position.copy(room.spot).add(room.root.position)
      kid.root.position.set(ROOM_X - 1.4, 0, 0.8)
      kid.root.rotation.y = 0.8

      const p4 = new THREE.Vector3(ROOM_X - 0.2, 2.1, 4.2)
      const l4 = new THREE.Vector3(ROOM_X - 0.5, 0.9, 0.6)
      bubble.say('Inside the living room: traditional 6-mat Tatami floor and the Chabudai table.', 3800)
      await tweenCamera(new THREE.Vector3(ROOM_X, 3.8, 12), p4, new THREE.Vector3(ROOM_X, 1.5, -2), l4, 2.0)
      if (cancelled) return

      bubble.say('Shinchan: "Chocobi! Waniyama-san dinosaur chocolate snacks are the best!"', 3800)
      pup.beg(2.5)
      await sleep(3600)
      if (cancelled) return

      // --- ACT 5: Action Kamen Broadcast on CRT TV ---
      currentStep = 4
      const p5 = new THREE.Vector3(ROOM_X + 2.0, 1.9, 1.2)
      const l5 = new THREE.Vector3(ROOM_X + 3.4, 1.45, -2.4)
      room.setScreen('ACTION KAMEN', 'Action Beam!', true)
      bubble.say('Look at the CRT TV with rabbit ears! Action Kamen is broadcasting!', 3400)
      await tweenCamera(stage.camera.position, p5, l4, l5, 1.8)
      if (cancelled) return

      kid.actionPose()
      bubble.say('WAHAHAHA! Action Beam! Shinchan strikes his superhero pose!', 4000)
      await sleep(4000)
      if (cancelled) return

      // --- ACT 6: The Iconic Buri-Buri Boogie! ---
      currentStep = 5
      const p6 = new THREE.Vector3(ROOM_X, 2.2, 4.8)
      const l6 = new THREE.Vector3(ROOM_X - 0.4, 1.2, 0.5)
      kid.root.position.set(ROOM_X - 0.5, 0, 0.8)
      await tweenCamera(stage.camera.position, p6, l5, l6, 1.8)
      if (cancelled) return

      kid.dance()
      pup.pet()
      bubble.say('Buri Buri Boogie! (ケツだけ星人) Sharmao mat, sabhi naacho naacho!', 4200)
      await sleep(4200)
      if (cancelled) return

      // --- Conclusion: House is Open for Free Play ---
      bubble.say('The Nohara house is all yours to explore! Click the TV, throw a bone, or tap items.', 4500)
      setView(VIEWS.room)
    } finally {
      running = false
      cancelled = false
    }
  }

  function stop() {
    cancelled = true
    running = false
  }

  return {
    start,
    stop,
    isRunning: () => running,
    getStep: () => currentStep,
  }
}
