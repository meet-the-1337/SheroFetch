import { createRoot } from 'react-dom/client'
import '../styles/app.css'
import { App } from './App.jsx'
import { syncBars } from '../lib/native.js'

syncBars()

// On a phone, hide the bottom tab bar while typing so it does not ride up on the keyboard.
const typing = (e) => e.target.matches?.('input:not([type=radio]):not([type=checkbox]):not([type=range]), textarea')
addEventListener('focusin', (e) => { if (typing(e)) document.documentElement.classList.add('kb-open') })
addEventListener('focusout', () => document.documentElement.classList.remove('kb-open'))

createRoot(document.getElementById('root')).render(<App />)
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {})
