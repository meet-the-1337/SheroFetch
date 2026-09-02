import React, { useState } from 'react'
import { audioEngine, EQ_FREQUENCIES, EQ_PRESETS } from '../audioEngine'
import { Sliders, Disc, MoreVertical } from 'lucide-react'

export function EqualizerView({ onClose }) {
  const [gains, setGains] = useState([...audioEngine.gains])
  const [preamp, setPreamp] = useState(0.0)
  const [bass, setBass] = useState(audioEngine.bassBoost)
  const [treble, setTreble] = useState(audioEngine.trebleBoost)
  const [activePreset, setActivePreset] = useState(audioEngine.currentPreset)
  const [isEquOn, setIsEquOn] = useState(true)
  const [isToneOn, setIsToneOn] = useState(true)
  const [isLimitOn, setIsLimitOn] = useState(true)
  const [showPresetsModal, setShowPresetsModal] = useState(false)

  const handleGainChange = (index, value) => {
    const val = parseFloat(value)
    const nextGains = [...gains]
    nextGains[index] = val
    setGains(nextGains)
    setActivePreset('Custom')
    audioEngine.setBandGain(index, val)
  }

  const handleBassChange = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const dx = clientX - (rect.left + rect.width / 2)
    const dy = clientY - (rect.top + rect.height / 2)
    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90
    if (angle < 0) angle += 360
    const pct = Math.max(0, Math.min(100, Math.round((angle / 300) * 100)))
    const db = (pct / 100) * 12
    setBass(db)
    audioEngine.setBassBoost(db)
  }

  const handleTrebleChange = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const dx = clientX - (rect.left + rect.width / 2)
    const dy = clientY - (rect.top + rect.height / 2)
    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90
    if (angle < 0) angle += 360
    const pct = Math.max(0, Math.min(100, Math.round((angle / 300) * 100)))
    const db = (pct / 100) * 12 - 6
    setTreble(db)
    audioEngine.setTrebleBoost(db)
  }

  const selectPreset = (name) => {
    setActivePreset(name)
    audioEngine.applyPreset(name)
    setGains([...audioEngine.gains])
    setShowPresetsModal(false)
  }

  const formatFreq = (freq) => {
    return freq >= 1000 ? `${freq / 1000}K` : `${freq}`
  }

  const bassPercent = Math.round((bass / 12) * 100)
  const treblePercent = Math.round(((treble + 6) / 12) * 100)

  return (
    <div className="w-full h-full flex flex-col bg-[#07080b] text-white pt-10 px-3 pb-28 select-none overflow-y-auto font-sans">
      {/* Top Toggle Switch Pill (Screenshot 5) */}
      <div className="flex justify-center mb-3">
        <div className="poweramp-pill-btn flex items-center p-1 gap-1">
          <button className="px-4 py-1.5 rounded-full bg-zinc-800 text-white shadow-md">
            <Sliders className="w-5 h-5" />
          </button>
          <button className="px-4 py-1.5 rounded-full text-zinc-500 hover:text-white">
            <Disc className="w-5 h-5" />
          </button>
          <button className="px-4 py-1.5 rounded-full text-zinc-500 hover:text-white font-mono font-bold text-xs">
            (O)
          </button>
        </div>
      </div>

      {/* 11 Vertical Faders: Preamp + 10-Band EQ (Screenshot 5) */}
      <div className="w-full flex items-center justify-between gap-1 my-2 px-1">
        {/* Preamp Column */}
        <div className="flex flex-col items-center flex-1">
          <div className="relative h-44 w-7 flex items-center justify-center">
            {/* Background Tick Marks */}
            <div className="absolute top-2 w-3 h-[1px] bg-white/20" />
            <div className="absolute top-1/2 w-3 h-[1px] bg-white/30" />
            <div className="absolute bottom-2 w-3 h-[1px] bg-white/20" />

            {/* Vertical Track */}
            <div className="w-1 h-36 rounded-full bg-zinc-800 relative overflow-hidden">
              <div
                className="absolute bottom-0 left-0 right-0 bg-[#00e676] shadow-[0_0_8px_#00e676]"
                style={{ height: `${Math.max(5, ((preamp + 12) / 24) * 100)}%` }}
              />
            </div>

            <input
              type="range"
              min="-12"
              max="12"
              step="0.5"
              value={preamp}
              onChange={(e) => setPreamp(parseFloat(e.target.value))}
              className="poweramp-eq-fader absolute w-36 h-7 rotate-[-90deg] origin-center z-20"
            />
          </div>
          <span className="text-[10px] font-bold text-white mt-1">Preamp</span>
          <span className="text-[9px] font-mono text-zinc-400">{preamp.toFixed(1)}</span>
        </div>

        {/* 10 Equalizer Faders */}
        {EQ_FREQUENCIES.map((freq, idx) => {
          const gain = gains[idx] || 0
          const pct = Math.max(5, ((gain + 12) / 24) * 100)

          return (
            <div key={freq} className="flex flex-col items-center flex-1">
              <div className="relative h-44 w-7 flex items-center justify-center">
                {/* Background Tick Marks */}
                <div className="absolute top-2 w-3 h-[1px] bg-white/20" />
                <div className="absolute top-1/2 w-3 h-[1px] bg-white/30" />
                <div className="absolute bottom-2 w-3 h-[1px] bg-white/20" />

                {/* Vertical Track with Neon Green Fill underneath */}
                <div className="w-1 h-36 rounded-full bg-zinc-800 relative overflow-hidden">
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-[#00e676] shadow-[0_0_8px_#00e676]"
                    style={{ height: `${pct}%` }}
                  />
                </div>

                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={gain}
                  onChange={(e) => handleGainChange(idx, e.target.value)}
                  className="poweramp-eq-fader absolute w-36 h-7 rotate-[-90deg] origin-center z-20"
                />
              </div>
              <span className="text-[10px] font-bold text-white mt-1">{formatFreq(freq)}</span>
              <span className="text-[9px] font-mono text-zinc-400">{gain.toFixed(1)}</span>
            </div>
          )
        })}
      </div>

      {/* Middle Acoustic Spectrum / Frequency Curve (Screenshot 5) */}
      <div className="w-full my-2">
        <div className="relative h-14 w-full rounded-2xl bg-zinc-900/90 border border-white/10 overflow-hidden flex items-center justify-center px-4 shadow-inner">
          {/* Subtle Acoustic Waveform / Curve Fill */}
          <div className="absolute inset-0 flex items-center justify-around opacity-30 px-3 pointer-events-none">
            {gains.map((g, i) => (
              <div
                key={i}
                className="w-1.5 rounded-full bg-white transition-all duration-200"
                style={{ height: `${Math.max(10, Math.min(90, 50 + g * 3))}%` }}
              />
            ))}
          </div>

          {/* Neon Green Response Curve Line */}
          <div className="w-full h-[2px] bg-[#00e676] shadow-[0_0_10px_#00e676] z-10" />
        </div>

        {/* Poweramp Status Pill */}
        <div className="text-center my-1">
          <span className="text-[10px] font-mono font-black text-zinc-400 uppercase tracking-widest">
            NO DVC EQ 10 TON LMT
          </span>
        </div>
      </div>

      {/* Lower Controls: Equ, Tone, Limit, Preset & Rotary Dials (Screenshot 5) */}
      <div className="flex items-center justify-between gap-2 mt-2 px-1">
        {/* Left Column Buttons */}
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => setIsEquOn(!isEquOn)}
            className={`poweramp-pill-btn px-4 py-1.5 text-xs font-bold transition ${
              isEquOn ? 'text-white bg-zinc-800' : 'text-zinc-500'
            }`}
          >
            Equ
          </button>
          <button
            onClick={() => setIsToneOn(!isToneOn)}
            className={`poweramp-pill-btn px-4 py-1.5 text-xs font-bold transition ${
              isToneOn ? 'text-white bg-zinc-800' : 'text-zinc-500'
            }`}
          >
            Tone
          </button>
          <button
            onClick={() => setIsLimitOn(!isLimitOn)}
            className={`poweramp-pill-btn px-4 py-1.5 text-xs font-bold transition ${
              isLimitOn ? 'text-white bg-zinc-800' : 'text-zinc-500'
            }`}
          >
            Limit
          </button>
        </div>

        {/* Center: Preset Pill & Rotary Knobs */}
        <div className="flex-1 flex flex-col gap-2">
          {/* Preset Button Row */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowPresetsModal(true)}
              className="poweramp-pill-btn flex-1 py-2 text-xs font-black text-white text-center"
            >
              Preset: {activePreset}
            </button>
            <button
              onClick={() => setShowPresetsModal(true)}
              className="poweramp-pill-btn p-2 text-white"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>

          {/* Rotary Dials: Bass & Treble */}
          <div className="flex items-center justify-around">
            {/* Bass Dial */}
            <div className="flex flex-col items-center">
              <span className="text-xs font-bold text-white">Bass</span>
              <span className="text-[10px] font-mono text-zinc-400 font-bold mb-1">{bassPercent}%</span>
              <div
                onClick={handleBassChange}
                className="relative w-16 h-16 rounded-full bg-[#121620] border-2 border-white/10 shadow-2xl flex items-center justify-center cursor-pointer active:scale-95 transition"
              >
                {/* Neon Green Circular Arc */}
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                  <circle
                    cx="30"
                    cy="30"
                    r="26"
                    fill="none"
                    stroke="#00e676"
                    strokeWidth="3"
                    strokeDasharray="163"
                    strokeDashoffset={163 - (163 * bassPercent) / 100}
                    strokeLinecap="round"
                    className="transition-all duration-150"
                  />
                </svg>
                {/* Knob Needle Marker */}
                <div
                  className="w-1.5 h-4 bg-white rounded-full transition-transform duration-150"
                  style={{ transform: `rotate(${(bassPercent / 100) * 270 - 135}deg) translateY(-14px)` }}
                />
              </div>
            </div>

            {/* Treble Dial */}
            <div className="flex flex-col items-center">
              <span className="text-xs font-bold text-white">Treble</span>
              <span className="text-[10px] font-mono text-zinc-400 font-bold mb-1">{treblePercent}%</span>
              <div
                onClick={handleTrebleChange}
                className="relative w-16 h-16 rounded-full bg-[#121620] border-2 border-white/10 shadow-2xl flex items-center justify-center cursor-pointer active:scale-95 transition"
              >
                {/* Neon Green Circular Arc */}
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                  <circle
                    cx="30"
                    cy="30"
                    r="26"
                    fill="none"
                    stroke="#00e676"
                    strokeWidth="3"
                    strokeDasharray="163"
                    strokeDashoffset={163 - (163 * treblePercent) / 100}
                    strokeLinecap="round"
                    className="transition-all duration-150"
                  />
                </svg>
                {/* Knob Needle Marker */}
                <div
                  className="w-1.5 h-4 bg-white rounded-full transition-transform duration-150"
                  style={{ transform: `rotate(${(treblePercent / 100) * 270 - 135}deg) translateY(-14px)` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preset Selector Modal */}
      {showPresetsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-xs bg-[#0d1017] border border-white/10 rounded-3xl p-5 shadow-2xl space-y-3 animate-in zoom-in-95">
            <h3 className="text-sm font-black text-white mb-2">Select Audio Preset</h3>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {Object.keys(EQ_PRESETS).map((p) => (
                <button
                  key={p}
                  onClick={() => selectPreset(p)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                    activePreset === p ? 'bg-[#00e676] text-black' : 'text-zinc-300 hover:bg-white/10'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowPresetsModal(false)}
              className="w-full py-2 rounded-xl bg-white/10 text-white font-bold text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
