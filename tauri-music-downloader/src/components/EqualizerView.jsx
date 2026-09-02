import React, { useState } from 'react'
import { audioEngine, EQ_FREQUENCIES, EQ_PRESETS } from '../audioEngine'
import { Sliders, RotateCcw, Volume2, Sparkles } from 'lucide-react'

export function EqualizerView({ onClose }) {
  const [gains, setGains] = useState([...audioEngine.gains])
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

  const handleBassChange = (value) => {
    const val = parseFloat(value)
    setBass(val)
    audioEngine.setBassBoost(val)
  }

  const handleTrebleChange = (value) => {
    const val = parseFloat(value)
    setTreble(val)
    audioEngine.setTrebleBoost(val)
  }

  const selectPreset = (name) => {
    setActivePreset(name)
    audioEngine.applyPreset(name)
    setGains([...audioEngine.gains])
  }

  const resetFlat = () => {
    selectPreset('Flat / Bypass')
    setBass(0)
    setTreble(0)
    audioEngine.setBassBoost(0)
    audioEngine.setTrebleBoost(0)
  }

  const formatFreq = (freq) => {
    return freq >= 1000 ? `${freq / 1000}k` : `${freq}`
  }

  return (
    <div className="w-full h-full flex flex-col bg-[#08090C] text-zinc-100 pt-10 px-4 pb-4 select-none overflow-y-auto">
      {/* Header */}
      <div className="flex justify-between items-center pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-[0_0_12px_rgba(0,229,255,0.2)]">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-wide">10-Band Graphic Equalizer</h2>
            <p className="text-xs text-zinc-400">Poweramp Precision WebAudio DSP</p>
          </div>
        </div>

        <button
          onClick={resetFlat}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-zinc-300 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>
      </div>

      {/* Preset Selector Chips */}
      <div className="my-4">
        <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-zinc-400">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>AUDIO PRESETS</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {Object.keys(EQ_PRESETS).map((p) => {
            const isSel = activePreset === p
            return (
              <button
                key={p}
                onClick={() => selectPreset(p)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 border ${
                  isSel
                    ? 'bg-cyan-500 text-black border-cyan-400 font-bold shadow-[0_0_12px_rgba(0,229,255,0.4)]'
                    : 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10'
                }`}
              >
                {p}
              </button>
            )
          })}
        </div>
      </div>

      {/* 10-Band Slider Console */}
      <div className="flex-1 min-h-[220px] bg-black/40 border border-white/10 rounded-2xl p-4 flex flex-col justify-between my-2">
        <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono">
          <span>+12 dB</span>
          <span>0 dB</span>
          <span>-12 dB</span>
        </div>

        <div className="flex justify-between items-center gap-1.5 h-44 my-2">
          {EQ_FREQUENCIES.map((freq, idx) => {
            const gain = gains[idx] || 0
            return (
              <div key={freq} className="flex-1 flex flex-col items-center justify-between h-full group">
                <span className="text-[10px] font-mono text-cyan-400 font-semibold mb-1">
                  {gain > 0 ? `+${gain}` : gain}
                </span>

                {/* Vertical Range Slider */}
                <div className="relative flex-1 flex items-center justify-center w-full">
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="0.5"
                    value={gain}
                    onChange={(e) => handleGainChange(idx, e.target.value)}
                    className="w-32 h-1.5 rounded-lg appearance-none cursor-pointer bg-zinc-700 accent-cyan-400 rotate-[-90deg] origin-center shadow-[0_0_6px_rgba(0,229,255,0.3)]"
                  />
                </div>

                <span className="text-[10px] font-mono text-zinc-400 mt-1">
                  {formatFreq(freq)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Bass Boost & Treble FX Knobs */}
      <div className="grid grid-cols-2 gap-3 mt-3">
        {/* Bass Boost */}
        <div className="p-3 rounded-2xl bg-zinc-900/60 border border-white/10 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-zinc-300">BASS BOOST</span>
            <span className="text-xs font-mono font-bold text-amber-400">+{bass.toFixed(1)} dB</span>
          </div>
          <input
            type="range"
            min="0"
            max="12"
            step="0.5"
            value={bass}
            onChange={(e) => handleBassChange(e.target.value)}
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-zinc-700 accent-amber-400"
          />
          <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
            <span>OFF</span>
            <span>+6 dB</span>
            <span>MAX</span>
          </div>
        </div>

        {/* Treble Boost */}
        <div className="p-3 rounded-2xl bg-zinc-900/60 border border-white/10 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-zinc-300">TREBLE</span>
            <span className="text-xs font-mono font-bold text-cyan-400">
              {treble > 0 ? `+${treble.toFixed(1)}` : treble.toFixed(1)} dB
            </span>
          </div>
          <input
            type="range"
            min="-6"
            max="6"
            step="0.5"
            value={treble}
            onChange={(e) => handleTrebleChange(e.target.value)}
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-zinc-700 accent-cyan-400"
          />
          <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
            <span>-6 dB</span>
            <span>0 dB</span>
            <span>+6 dB</span>
          </div>
        </div>
      </div>
    </div>
  )
}
