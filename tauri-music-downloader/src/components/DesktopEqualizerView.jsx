import React, { useState } from 'react'
import { audioEngine, EQ_FREQUENCIES, EQ_PRESETS } from '../audioEngine'
import { Sliders, Disc, Sparkles, Check, RotateCcw } from 'lucide-react'

export function DesktopEqualizerView() {
  const [gains, setGains] = useState([...audioEngine.gains])
  const [preamp, setPreamp] = useState(0.0)
  const [bass, setBass] = useState(audioEngine.bassBoost)
  const [treble, setTreble] = useState(audioEngine.trebleBoost)
  const [activePreset, setActivePreset] = useState(audioEngine.currentPreset)

  const handleGainChange = (index, value) => {
    const val = parseFloat(value)
    const nextGains = [...gains]
    nextGains[index] = val
    setGains(nextGains)
    setActivePreset('Custom')
    audioEngine.setBandGain(index, val)
  }

  const selectPreset = (name) => {
    setActivePreset(name)
    audioEngine.applyPreset(name)
    setGains([...audioEngine.gains])
  }

  const resetFlat = () => {
    selectPreset('Flat / Bypass')
    setBass(0)
    audioEngine.setBassBoost(0)
    setTreble(0)
    audioEngine.setTrebleBoost(0)
  }

  const formatFreq = (freq) => {
    return freq >= 1000 ? `${freq / 1000}kHz` : `${freq}Hz`
  }

  return (
    <div className="w-full h-full flex flex-col bg-[#07080E] text-zinc-100 overflow-y-auto select-none p-8 font-sans">
      {/* 1. Header & Presets */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-white/5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-white">Studio DSP & Equalizer</h1>
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              32-Bit Float Processing
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1 font-medium">
            10-Band precision hardware parametric biquad filtering with dynamic analog tube saturation.
          </p>
        </div>

        <button
          onClick={resetFlat}
          className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-bold text-zinc-300 hover:text-white transition flex items-center gap-2"
        >
          <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
          <span>Reset to Flat</span>
        </button>
      </div>

      {/* 2. Studio Presets Bar */}
      <div className="mt-6">
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold block mb-2.5">
          ACOUSTIC PRESETS
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          {Object.keys(EQ_PRESETS).map((p) => (
            <button
              key={p}
              onClick={() => selectPreset(p)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                activePreset === p
                  ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(0,229,255,0.4)]'
                  : 'bg-white/[0.03] hover:bg-white/[0.06] text-zinc-300 border border-white/5'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* 3. 10-Band Graphic Equalizer Faders */}
      <div className="mt-8 p-6 rounded-3xl bg-[#0A0D15]/80 border border-white/5 shadow-2xl flex flex-col gap-6">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span>10-Band Graphic Fader Bank (+12 dB to -12 dB)</span>
          </span>
          <span className="text-xs font-mono text-cyan-400 font-bold">
            Preset: {activePreset}
          </span>
        </div>

        <div className="grid grid-cols-10 gap-2 sm:gap-4 items-center justify-items-center py-4">
          {EQ_FREQUENCIES.map((freq, idx) => {
            const gain = gains[idx] || 0

            return (
              <div key={freq} className="flex flex-col items-center gap-3 w-full">
                {/* dB Readout */}
                <span className="text-[10px] font-mono font-bold text-zinc-400 h-4">
                  {gain > 0 ? `+${gain.toFixed(0)}` : gain.toFixed(0)}
                </span>

                {/* Vertical Slider */}
                <div className="h-48 flex items-center justify-center relative">
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="0.5"
                    value={gain}
                    onChange={(e) => handleGainChange(idx, e.target.value)}
                    className="h-40 -rotate-90 appearance-none bg-zinc-800 rounded-full cursor-pointer accent-cyan-400"
                    style={{ width: '160px' }}
                  />
                </div>

                {/* Frequency Label */}
                <span className="text-[11px] font-mono font-bold text-zinc-300 text-center">
                  {formatFreq(freq)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
