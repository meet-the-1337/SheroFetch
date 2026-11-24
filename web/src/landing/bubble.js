import * as THREE from 'three'

// Shero's speech bubble: a DOM element pinned above his head in screen space.
export function createBubble(el, canvas, camera, anchor) {
  const p = new THREE.Vector3()
  let timer = 0
  const place = () => {
    if (el.hidden) return
    anchor.getWorldPosition(p)
    p.y += 0.95
    p.project(camera)
    const w = canvas.clientWidth, h = canvas.clientHeight
    const x = Math.min(Math.max((p.x * 0.5 + 0.5) * w - 40, 8), w - el.offsetWidth - 8)
    const y = Math.max((-p.y * 0.5 + 0.5) * h - el.offsetHeight - 12, 8)
    el.style.setProperty('--bx', `${x}px`)
    el.style.setProperty('--by', `${y}px`)
  }
  return {
    place,
    say(text, ms = 2400) {
      el.textContent = text
      el.hidden = false
      place()
      requestAnimationFrame(() => el.classList.add('is-on'))
      clearTimeout(timer)
      timer = setTimeout(() => {
        el.classList.remove('is-on')
        timer = setTimeout(() => { el.hidden = true }, 260)
      }, ms)
    },
  }
}

export const pickLine = (lines) => lines[Math.floor(Math.random() * lines.length)]
