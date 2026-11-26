import { createRoot } from 'react-dom/client'
import '../styles/app.css'
import { App } from './App.jsx'
import { syncBars } from '../lib/native.js'

syncBars()

// On a phone, hide the bottom tab bar while the keyboard is up so it does not ride on top of it.
// The keyboard counts as up while a text field has focus and the screen got clearly shorter; closing
// the keyboard with the back button leaves the field focused, so focus alone is not enough.
const isTyping = () => document.activeElement?.matches?.('input:not([type=radio]):not([type=checkbox]):not([type=range]), textarea')
let tallest = innerHeight
function kb() {
  const h = Math.min(innerHeight, visualViewport?.height ?? innerHeight)
  if (!isTyping()) tallest = Math.max(tallest, innerHeight)
  document.documentElement.classList.toggle('kb-open', Boolean(isTyping()) && h < tallest * 0.8)
}
addEventListener('focusin', () => setTimeout(kb, 300))
addEventListener('focusout', kb)
addEventListener('resize', kb)
visualViewport?.addEventListener('resize', kb)
addEventListener('orientationchange', () => { tallest = 0; setTimeout(() => { tallest = innerHeight; kb() }, 400) })

createRoot(document.getElementById('root')).render(<App />)
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {})
