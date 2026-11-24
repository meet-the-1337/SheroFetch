import { useEffect, useState } from 'react'
import { rpc } from '../lib/supabase.js'

const SITE = 'https://sherofetch.vercel.app'
const OS = [
  ['windows', 'Windows PC'],
  ['unix', 'Linux or Mac'],
  ['android', 'Android phone'],
]
const guessOs = () => (/android/i.test(navigator.userAgent) ? 'android' : /windows/i.test(navigator.userAgent) ? 'windows' : 'unix')

export function command(os, code) {
  if (os === 'windows') return `powershell -ExecutionPolicy Bypass -c "& ([scriptblock]::Create((irm ${SITE}/get.ps1))) ${code}"`
  return `curl -fsSL ${SITE}/get.sh | sh -s -- ${code}`
}

/** My own devices, refreshed every few seconds while `fast`, else every 30 s. */
export function useMyDevices(fast = false) {
  const [devices, setDevices] = useState(null)
  useEffect(() => {
    let live = true
    const load = () => rpc('my_devices').then((d) => live && setDevices(d || [])).catch(() => live && setDevices((x) => x || []))
    load()
    const t = setInterval(load, fast ? 5000 : 30000)
    return () => { live = false; clearInterval(t) }
  }, [fast])
  return devices
}

const SEEN_KEY = 'sf-device-choice'
export const deviceChoiceMade = () => { try { return Boolean(localStorage.getItem(SEEN_KEY)) } catch { return true } }
export const rememberDeviceChoice = (v) => { try { localStorage.setItem(SEEN_KEY, v) } catch { /* storage off */ } }

/** First visit: how should songs be fetched for this person? */
export function DeviceChoice({ onSetup, onDone }) {
  return (
    <aside className="choice" aria-labelledby="choice-title">
      <h2 id="choice-title">How should Shero fetch your songs?</h2>
      <div className="choice__opts">
        <button type="button" className="choice__opt" onClick={() => { rememberDeviceChoice('shared'); onDone() }}>
          <b>On SheroFetch’s machines</b>
          <span>Nothing to set up. A daily limit applies.</span>
        </button>
        <button type="button" className="choice__opt" onClick={() => { rememberDeviceChoice('own'); onSetup() }}>
          <b>On my own PC or phone</b>
          <span>No daily limit. Uses your internet and, if you like, your own Soulseek account. About 5 minutes to set up.</span>
        </button>
      </div>
    </aside>
  )
}

/* ---------------------------------------------------------------- the set-up wizard and device list */

export function Devices() {
  const [os, setOs] = useState(guessOs)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const devices = useMyDevices(Boolean(code))
  const before = useState(() => new Set())[0]
  useEffect(() => { if (devices && !code) devices.forEach((d) => before.add(d.id)) }, [devices, code, before])
  const fresh = code && devices?.find((d) => !before.has(d.id))

  async function makeCode() {
    setMsg('')
    try { setCode(await rpc('create_device_code')); setCopied(false) } catch (err) { setMsg(String(err?.message || err)) }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(command(os, code)); setCopied(true) } catch { setMsg('Copy did not work; select the command and copy it by hand.') }
  }
  async function remove(d) {
    if (!confirm(`Remove ${d.name}? It stops fetching for you. To use it again, set it up with a new code.`)) return
    try { await rpc('remove_device', { p_id: d.id }) } catch (err) { setMsg(String(err?.message || err)) }
  }

  return (
    <section className="devices" aria-labelledby="dev-title">
      <h1 id="dev-title">Fetch on your own device</h1>
      <p className="lede">Your PC or phone fetches your songs itself, with no daily limit. It uses your own internet, YouTube, and your own Soulseek account if you add one. Your Soulseek password stays on your device; SheroFetch never sees it.</p>

      {devices?.length > 0 && (
        <>
          <h2 className="sub sub--small">Your devices</h2>
          <ul className="devlist">
            {devices.map((d) => (
              <li key={d.id}>
                <div>
                  <b>{d.name}</b>
                  <span className="muted small">
                    {d.online ? (d.active ? `Fetching ${d.active}` : d.accepting ? 'Online, waiting for songs' : 'Online, paused for low battery') : `Offline${d.last_seen ? ` since ${new Date(d.last_seen).toLocaleString()}` : ''}`}
                    {`. ${d.soulseek ? 'Soulseek on' : 'YouTube only (no Soulseek account)'}. ${d.done} fetched${d.failed ? `, ${d.failed} failed` : ''}.`}
                    {d.battery?.pct != null ? ` Battery ${d.battery.pct}%${d.battery.charging ? ', charging' : ''}.` : ''}
                  </span>
                </div>
                <button className="btn btn--ghost" type="button" onClick={() => remove(d)}>Remove</button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="sub sub--small">{devices?.length ? 'Add another device' : 'Set up a device'}</h2>
      <ol className="steps">
        <li>
          <b>Which device?</b>
          <div className="seg" role="radiogroup" aria-label="Device type">
            {OS.map(([v, l]) => <label key={v}><input type="radio" name="os" value={v} checked={os === v} onChange={() => setOs(v)} /><span>{l}</span></label>)}
          </div>
          {os === 'android' && (
            <p className="muted small">Install <a className="link" href="https://f-droid.org/packages/com.termux/" target="_blank" rel="noreferrer">Termux</a>, <a className="link" href="https://f-droid.org/packages/com.termux.api/" target="_blank" rel="noreferrer">Termux:API</a> and <a className="link" href="https://f-droid.org/packages/com.termux.boot/" target="_blank" rel="noreferrer">Termux:Boot</a> from F-Droid first, then open Termux. The first setup takes 15 to 20 minutes on a phone.</p>
          )}
          {os === 'windows' && <p className="muted small">Open PowerShell from the Start menu. Windows 10 or 11 with winget is needed.</p>}
          {os === 'unix' && <p className="muted small">Open a terminal. On a Mac, <a className="link" href="https://brew.sh" target="_blank" rel="noreferrer">Homebrew</a> is needed.</p>}
        </li>
        <li>
          <b>Have your Soulseek account ready (optional).</b>
          <p className="muted small">Soulseek is where real FLAC and 320 kbps rips come from. The installer asks for it on your device. No account? Choose any new username and password and Soulseek makes one the first time. You can also skip it and use YouTube only.</p>
        </li>
        <li>
          <b>Run this on the device.</b>
          {!code ? (
            <div><button className="btn btn--primary" type="button" onClick={makeCode}>Make my set-up code</button></div>
          ) : (
            <>
              <pre className="cmd" tabIndex={0}>{command(os, code)}</pre>
              <div className="plcard__acts">
                <button className="btn btn--primary" type="button" onClick={copy}>{copied ? 'Copied' : 'Copy the command'}</button>
                <button className="btn btn--ghost" type="button" onClick={makeCode}>New code</button>
              </div>
              <p className="muted small">The code <b>{code}</b> works once, for 24 hours. The installer sets up Python, ffmpeg, yt-dlp, the Soulseek client and a secure tunnel, then starts SheroFetch every time the device starts.</p>
            </>
          )}
        </li>
        <li>
          <b>Wait for it here.</b>
          {fresh ? (
            <p className="ok" role="status">{fresh.name} is connected{fresh.online ? ' and online' : ''}. Pick “My device” when you fetch.</p>
          ) : (
            <p className="muted small" role="status">{code ? 'Waiting for your device to say hello…' : 'This page notices the device by itself once it is linked.'}</p>
          )}
        </li>
      </ol>
      <p className="help" role="alert">{msg}</p>
    </section>
  )
}
