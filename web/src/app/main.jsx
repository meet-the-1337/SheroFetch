import { createRoot } from 'react-dom/client'
import '../styles/app.css'
import { App } from './App.jsx'
import { syncBars } from '../lib/native.js'

syncBars()

createRoot(document.getElementById('root')).render(<App />)
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {})
