import React, { useRef, useState, useMemo } from 'react'

export function WaveformSeekbar({
  currentTime = 0,
  duration = 0,
  onSeek,
  trackId = '',
  isPlaying = false
}) {
  const containerRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [hoverPercent, setHoverPercent] = useState(null)

  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0
  const BAR_COUNT = 60

  // Stable pseudo-random waveform bar heights seeded by trackId
  const barHeights = useMemo(() => {
    let seed = 1337
    for (let i = 0; i < trackId.length; i++) {
      seed = (seed * 31 + trackId.charCodeAt(i)) & 0xffffffff
    }
    const heights = []
    for (let i = 0; i < BAR_COUNT; i++) {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff
      const normalized = (Math.abs(seed) % 100) / 100
      // Shaped distribution (tapered edges, punchy mids)
      const envelope = Math.sin((i / BAR_COUNT) * Math.PI)
      const h = Math.round(18 + normalized * 70 * (0.4 + 0.6 * envelope))
      heights.push(Math.max(15, Math.min(95, h)))
    }
    return heights
  }, [trackId])

  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return '0:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  const handleSeekFromEvent = (e) => {
    if (!containerRef.current || !duration) return
    const rect = containerRef.current.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    onSeek(pct * duration)
  }

  return (
    <div className="w-full flex flex-col gap-1.5 select-none my-1">
      {/* 60-Bar Poweramp Waveform Stage */}
      <div
        ref={containerRef}
        className="relative h-14 w-full flex items-center justify-between cursor-pointer group px-1 py-1 rounded-xl bg-black/30 backdrop-blur-md border border-white/5"
        onMouseDown={(e) => {
          setIsDragging(true)
          handleSeekFromEvent(e)
        }}
        onMouseMove={(e) => {
          if (isDragging) handleSeekFromEvent(e)
          if (containerRef.current && duration) {
            const rect = containerRef.current.getBoundingClientRect()
            setHoverPercent(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)))
          }
        }}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => {
          setIsDragging(false)
          setHoverPercent(null)
        }}
        onTouchStart={(e) => {
          setIsDragging(true)
          handleSeekFromEvent(e)
        }}
        onTouchMove={(e) => {
          if (isDragging) handleSeekFromEvent(e)
        }}
        onTouchEnd={() => setIsDragging(false)}
      >
        {/* Glow overlay behind the active portion */}
        <div
          className="absolute top-0 left-0 bottom-0 pointer-events-none rounded-l-xl transition-all duration-75"
          style={{
            width: `${progress * 100}%`,
            background: 'linear-gradient(90deg, rgba(0, 229, 255, 0.05), rgba(0, 229, 255, 0.22))'
          }}
        />

        {/* 60 Acoustic Bars */}
        <div className="w-full h-full flex items-center justify-between gap-[2px] z-10">
          {barHeights.map((h, i) => {
            const barProgress = i / (BAR_COUNT - 1)
            const isPlayed = barProgress <= progress

            return (
              <div
                key={i}
                className="flex-1 rounded-full transition-all duration-100 relative"
                style={{
                  height: `${h}%`,
                  backgroundColor: isPlayed ? '#00E5FF' : 'rgba(255, 255, 255, 0.16)',
                  boxShadow: isPlayed
                    ? '0 0 6px rgba(0, 229, 255, 0.7), 0 0 12px rgba(0, 229, 255, 0.3)'
                    : 'none',
                  transform: isPlaying && isPlayed && i % 3 === 0 ? 'scaleY(1.06)' : 'none'
                }}
              />
            )
          })}
        </div>

        {/* Poweramp Glowing Cursor / Scrubber Line */}
        <div
          className="absolute top-0 bottom-0 w-[3px] bg-white pointer-events-none z-20 rounded-full shadow-[0_0_10px_#00E5FF,0_0_18px_#00E5FF]"
          style={{ left: `${progress * 100}%` }}
        >
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-[5px] w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-white shadow-[0_0_8px_#00E5FF]" />
        </div>
      </div>

      {/* Time Elapsed & Remaining Countdown */}
      <div className="flex justify-between items-center text-[11px] font-mono tracking-wider font-semibold text-zinc-400 px-1">
        <span className="text-cyan-400 drop-shadow-[0_0_6px_rgba(0,229,255,0.4)]">
          {formatTime(currentTime)}
        </span>
        <span className="text-zinc-500">
          -{formatTime(Math.max(0, duration - currentTime))}
        </span>
      </div>
    </div>
  )
}
