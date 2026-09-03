import React, { useState } from 'react'
import { Disc, Lock, User, Eye, EyeOff, Sparkles, CheckCircle2, AlertCircle, ArrowRight, ShieldCheck, X } from 'lucide-react'

export function SoulseekOnboardingModal({ isOpen, onClose, onSuccess, invokeFn }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  if (!isOpen) return null

  const handleConnect = async (e) => {
    if (e) e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setErrorMsg('Please enter both your Soulseek username and password.')
      return
    }

    setIsLoading(true)
    setErrorMsg('')

    try {
      const prof = await invokeFn('save_soulseek_profile', {
        username: username.trim(),
        password: password.trim()
      })
      if (prof && prof.logged_in) {
        if (onSuccess) onSuccess(prof)
        if (onClose) onClose()
      } else {
        setErrorMsg('Could not verify credentials on Soulseek network. Please verify and retry.')
      }
    } catch (err) {
      console.error('[Onboarding] Login error:', err)
      setErrorMsg(err.message || 'Failed to authenticate with Soulseek server.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSkip = () => {
    try {
      localStorage.setItem('sherofetch_onboarding_done', 'true')
    } catch {}
    if (onClose) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-md bg-zinc-950 border border-cyan-500/30 rounded-3xl p-6 shadow-[0_0_50px_rgba(0,229,255,0.15)] flex flex-col gap-5 overflow-hidden">
        
        {/* Top Close Button */}
        <button
          type="button"
          onClick={handleSkip}
          className="absolute top-4 right-4 p-2 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white transition z-20 border border-white/10"
          title="Close / Guest Mode"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Ambient Top Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-20 bg-cyan-500/20 blur-3xl pointer-events-none" />

        {/* Header Badge & Title */}
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(0,229,255,0.2)]">
            <Disc className="w-7 h-7 animate-spin-slow" />
          </div>
          <h2 className="text-xl font-black tracking-wide text-white flex items-center gap-1.5 mt-1">
            <span>SheroFetch P2P Mesh</span>
            <Sparkles className="w-4 h-4 text-cyan-400" />
          </h2>
          <p className="text-xs text-zinc-400 leading-relaxed max-w-xs">
            Connect your Soulseek account to unlock authentic, bit-perfect <span className="text-cyan-300 font-semibold">1411kbps+ FLAC</span> CD and vinyl rips directly from collectors worldwide.
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleConnect} className="flex flex-col gap-3.5">
          {/* Username */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Soulseek Username
            </label>
            <div className="relative flex items-center">
              <User className="absolute left-3.5 w-4 h-4 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. AudiophileMaster"
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-900/90 border border-white/10 text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40 transition"
              />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Password
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
                className="w-full pl-10 pr-11 py-2.5 rounded-xl bg-zinc-900/90 border border-white/10 text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40 transition"
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

          {/* Network Notice */}
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-start gap-2.5 text-[11px] text-zinc-400 leading-normal">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <span>
              Soulseek is 100% free and open. Your credentials connect directly to <span className="text-zinc-200 font-mono">server.slsknet.org:2242</span> and are stored securely on your device.
            </span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-1 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-black font-extrabold text-sm flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,229,255,0.3)] transition disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                <span>Connecting to Soulseek Mesh...</span>
              </>
            ) : (
              <>
                <span>Connect & Join Mesh</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Skip / Guest Option */}
        <div className="flex flex-col items-center text-center pt-1 border-t border-white/5">
          <button
            type="button"
            onClick={handleSkip}
            className="text-xs font-semibold text-zinc-500 hover:text-zinc-300 transition py-1"
          >
            Skip for now (Continue in 320k Studio Stream Mode)
          </button>
        </div>

      </div>
    </div>
  )
}
