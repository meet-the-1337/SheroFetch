import React, { useState } from 'react'
import {
  Disc,
  Lock,
  User,
  Eye,
  EyeOff,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  X,
  RotateCw,
  RefreshCw,
  Radio
} from 'lucide-react'

export function SoulseekOnboardingModal({ isOpen, onClose, onSuccess, invokeFn }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('idle') // 'idle' | 'testing' | 'success' | 'failed'
  const [verifiedProfile, setVerifiedProfile] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')

  React.useEffect(() => {
    if (isOpen && invokeFn) {
      invokeFn('get_gemini_key')
        .then((k) => { if (k) setGeminiKey(k) })
        .catch(() => {})
    }
  }, [isOpen, invokeFn])

  if (!isOpen) return null

  const handleConnect = async (e) => {
    if (e) e.preventDefault()
    const u = username.trim()
    const p = password.trim()
    const gKey = geminiKey.trim()

    // Save Gemini key if provided
    if (gKey && invokeFn) {
      try {
        await invokeFn('save_gemini_key', { key: gKey })
      } catch (err) {
        console.warn('[Onboarding] Error saving Gemini key:', err)
      }
    }

    if (!u || !p) {
      setConnectionStatus('failed')
      setErrorMessage('Please enter both your Soulseek username and password (or click Skip below to use YouTube mode).')
      return
    }

    setConnectionStatus('testing')
    setErrorMessage('')

    try {
      const prof = await invokeFn('save_soulseek_profile', {
        username: u,
        password: p
      })

      if (prof && prof.logged_in) {
        setVerifiedProfile(prof)
        setConnectionStatus('success')
        if (onSuccess) onSuccess(prof)
      } else {
        setConnectionStatus('failed')
        setErrorMessage('Soulseek server rejected connection without reason.')
      }
    } catch (err) {
      console.error('[Onboarding] Login error:', err)
      const raw = typeof err === 'string' ? err : err?.message || 'Failed to authenticate with Soulseek server.'
      setConnectionStatus('failed')
      setErrorMessage(raw)
    }
  }

  const handleFinish = () => {
    if (onClose) onClose()
  }

  const handleSkip = () => {
    if (onClose) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-2xl animate-fade-in select-none">
      <div className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto glass-panel border border-white/10 rounded-3xl p-5 sm:p-7 shadow-[0_25px_60px_rgba(0,0,0,0.95)] flex flex-col gap-4 sm:gap-5 animate-slideUp bg-[#090C14]">
        
        {/* Top Close Button */}
        <button
          type="button"
          onClick={handleSkip}
          className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 p-2 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white transition z-20 border border-white/10"
          title="Close / Skip to Studio Mode"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Ambient Top Glow */}
        <div
          className={`absolute top-0 left-1/2 -translate-x-1/2 w-64 h-24 pointer-events-none rounded-full blur-2xl transition-all duration-500 ${
            connectionStatus === 'success'
              ? 'bg-emerald-500/20'
              : connectionStatus === 'failed'
              ? 'bg-rose-500/25'
              : 'bg-cyan-500/15'
          }`}
        />

        {/* Header Icon & Title */}
        <div className="flex flex-col items-center text-center gap-2 relative z-10">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-300 ${
              connectionStatus === 'success'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_25px_rgba(16,185,129,0.3)]'
                : connectionStatus === 'failed'
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-[0_0_25px_rgba(244,63,94,0.3)]'
                : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-[0_0_20px_rgba(0,229,255,0.2)]'
            }`}
          >
            {connectionStatus === 'testing' ? (
              <RotateCw className="w-7 h-7 animate-spin" />
            ) : connectionStatus === 'success' ? (
              <ShieldCheck className="w-8 h-8 text-emerald-400" />
            ) : connectionStatus === 'failed' ? (
              <AlertCircle className="w-8 h-8 text-rose-400" />
            ) : (
              <Disc className="w-7 h-7 animate-spin-slow" />
            )}
          </div>

          <h2 className="text-xl font-black tracking-wide text-white flex items-center gap-2 mt-1 font-mono">
            <span>SOULSEEK P2P MESH</span>
            <Sparkles className="w-4 h-4 text-cyan-400" />
          </h2>

          <p className="text-xs text-zinc-400 leading-relaxed max-w-sm">
            Authenticate directly against <span className="text-zinc-200 font-mono">server.slsknet.org:2242</span> to download authentic, bit-perfect <span className="text-cyan-300 font-semibold">1411kbps+ FLAC</span> directly from peers.
          </p>
        </div>

        {/* REAL CONNECTION RESPONSE: SUCCESS (GREEN) */}
        {connectionStatus === 'success' && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/40 text-emerald-300 text-xs flex flex-col gap-3 shadow-[0_0_25px_rgba(16,185,129,0.2)] animate-slideUp">
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_#34d399]" />
              <span className="text-sm font-black uppercase tracking-wider text-emerald-400 font-mono">
                REAL CONNECTION VERIFIED: CONNECTED
              </span>
            </div>

            <p className="text-xs text-emerald-200/90 leading-relaxed font-sans">
              Successfully authenticated as <strong className="text-white font-mono">@{verifiedProfile?.username || username}</strong> with the Soulseek central server. Authentic P2P FLAC downloads are now active!
            </p>

            <button
              type="button"
              onClick={handleFinish}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.4)] transition"
            >
              <span>Enter SheroFetch Vault</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* REAL CONNECTION RESPONSE: FAILED (RED) */}
        {connectionStatus === 'failed' && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border-2 border-rose-500/40 text-rose-300 text-xs flex flex-col gap-2.5 shadow-[0_0_25px_rgba(244,63,94,0.25)] animate-slideUp">
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_10px_#f43f5e]" />
              <span className="text-sm font-black uppercase tracking-wider text-rose-400 font-mono">
                REAL CONNECTION RESPONSE: FAILED
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-black/50 border border-rose-500/20 font-mono text-[11px] text-rose-200 break-words">
              {errorMessage || 'Connection rejected by server.slsknet.org:2242.'}
            </div>

            <p className="text-[11px] text-zinc-400 leading-normal">
              <strong>Soulseek Protocol Rule:</strong> Accounts are registered automatically. If your password was rejected (`INVALIDPASS`), the username is already owned by someone else. Simply choose any brand-new unused username and it will auto-register on first connection!
            </p>
          </div>
        )}

        {/* Login Form (Shown when idle, testing, or failed) */}
        {connectionStatus !== 'success' && (
          <form onSubmit={handleConnect} className="flex flex-col gap-3.5 relative z-10">
            {/* Username Input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 font-mono">
                Soulseek Username
              </label>
              <div className="relative flex items-center">
                <User className="absolute left-3.5 w-4 h-4 text-zinc-500 pointer-events-none" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. user_1337"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-900/90 border border-white/10 text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40 transition font-mono"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 font-mono">
                Soulseek Password
              </label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3.5 w-4 h-4 text-zinc-500 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Soulseek password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full pl-10 pr-11 py-2.5 rounded-xl bg-zinc-900/90 border border-white/10 text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40 transition font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 p-1 text-zinc-500 hover:text-zinc-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Google Gemini API Key Input (Optional) */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Google Gemini API Key</span>
                  <span className="text-zinc-500 lowercase text-[10px]">(optional)</span>
                </label>
              </div>
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="AI Studio API Key (leave empty to skip)"
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-900/90 border border-white/10 text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40 transition font-mono"
              />
              <p className="text-[10px] text-zinc-500">
                Used for Gate 3 AI audio lyric verification. If skipped, local Chromaprint verification is used.
              </p>
            </div>

            {/* Live Socket Info */}
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-start gap-2.5 text-[11px] text-zinc-400 leading-normal">
              <Radio className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
              <span>
                Clicking verify will perform an instantaneous binary handshake on port 2242 with <span className="text-zinc-200 font-mono">server.slsknet.org</span>.
              </span>
            </div>

            {/* Verify & Connect Button */}
            <button
              type="submit"
              disabled={connectionStatus === 'testing'}
              className="w-full mt-1 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-black font-extrabold text-sm flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,229,255,0.3)] transition disabled:opacity-50"
            >
              {connectionStatus === 'testing' ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin text-black" />
                  <span>Verifying on server.slsknet.org:2242...</span>
                </>
              ) : (
                <>
                  <span>Verify & Connect to Soulseek</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Skip / Studio Fallback */}
        {connectionStatus !== 'success' && (
          <div className="flex flex-col items-center text-center pt-1 border-t border-white/5">
            <button
              type="button"
              onClick={handleSkip}
              className="text-xs font-semibold text-zinc-500 hover:text-zinc-300 transition py-1"
            >
              Skip for now (Continue in Studio Mode without P2P)
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
