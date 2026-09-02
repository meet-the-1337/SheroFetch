import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { audioEngine } from '../audioEngine'

export function WaveformSeekbar({
  currentTime = 0,
  duration = 0,
  onSeek,
  trackId = '',
  isPlaying = false
}) {
  const canvasRef = useRef(null)
  const isDraggingRef = useRef(false)
  const [dragTime, setDragTime] = useState(null)

  const effectiveTime = dragTime !== null ? dragTime : currentTime
  const progress = duration > 0 ? Math.min(1, Math.max(0, effectiveTime / duration)) : 0

  const BAR_COUNT = 96

  // Stable acoustic waveform amplitude peaks seeded by trackId
  const peaks = useMemo(() => {
    let seed = 2026
    for (let i = 0; i < (trackId || 'track').length; i++) {
      seed = (seed * 37 + trackId.charCodeAt(i)) & 0xffffffff
    }
    const arr = new Float32Array(BAR_COUNT)
    for (let i = 0; i < BAR_COUNT; i++) {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff
      const rand = (Math.abs(seed) % 1000) / 1000
      // Acoustic envelope: lower at intro/outro, energetic in the body
      const env = Math.sin((i / (BAR_COUNT - 1)) * Math.PI)
      const val = 0.15 + 0.85 * (0.35 * rand + 0.65 * env)
      arr[i] = Math.max(0.1, Math.min(0.98, val))
    }
    return arr
  }, [trackId])

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    const centerY = height / 2

    ctx.clearRect(0, 0, width, height)

    // Optional live frequency boost
    const freqData = isPlaying ? audioEngine.getFrequencyData() : null

    const totalBars = BAR_COUNT
    const barSpacing = width / totalBars
    const barWidth = Math.max(1.8, barSpacing * 0.68)
    const currentBarIdx = Math.floor(progress * totalBars)

    for (let i = 0; i < totalBars; i++) {
      let amp = peaks[i]
      if (freqData && i < freqData.length) {
        const liveBonus = (freqData[i % freqData.length] / 255) * 0.25
        amp = Math.min(1.0, amp + liveBonus)
      }

      const barHeight = amp * (centerY - 4)
      const x = i * barSpacing + (barSpacing - barWidth) / 2
      const isPlayed = i <= currentBarIdx

      if (isPlayed) {
        // Played: Poweramp Electric Cyan Gradient with Neon Glow
        const grad = ctx.createLinearGradient(0, centerY - barHeight, 0, centerY + barHeight)
        grad.addColorStop(0, '#38bdf8')
        grad.addColorStop(0.5, '#00e5ff')
        grad.addColorStop(1, '#0284c7')

        ctx.fillStyle = grad
        ctx.shadowColor = '#00e5ff'
        ctx.shadowBlur = isPlaying ? 5 : 2
      } else {
        // Unplayed: Poweramp Muted Slate Translucent
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
        ctx.shadowColor = 'transparent'
        ctx.shadowBlur = 0
      }

      // Upper & Lower Mirror Bar
      ctx.beginPath()
      ctx.roundRect(x, centerY - barHeight, barWidth, barHeight * 2, [1.5])
      ctx.fill()
    }

    // Poweramp High-Precision Playhead Needle
    const playheadX = Math.min(width - 2, Math.max(0, progress * width))

    // Vertical Needle Line
    ctx.shadowColor = '#00e5ff'
    ctx.shadowBlur = 10
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(playheadX - 1, 0, 2, height)

    // Center Needle Diamond Indicator
    ctx.beginPath()
    ctx.arc(playheadX, centerY, 4.5, 0, Math.PI * 2)
    ctx.fillStyle = '#00e5ff'
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
  }, [peaks, progress, isPlaying])

  useEffect(() => {
    let animId
    const loop = () => {
      renderCanvas()
      if (isPlaying) {
        animId = requestAnimationFrame(loop)
      }
    }
    loop()
    return () => cancelAnimationFrame(animId)
  }, [renderCanvas, isPlaying])

  const getTimeFromEvent = (e) => {
    const canvas = canvasRef.current
    if (!canvas || !duration) return 0
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return pct * duration
  }

  const handlePointerDown = (e) => {
    isDraggingRef.current = true
    const t = getTimeFromEvent(e)
    setDragTime(t)
  }

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current) return
    const t = getTimeFromEvent(e)
    setDragTime(t)
  }

  const handlePointerUp = () => {
    if (isDraggingRef.current && dragTime !== null) {
      onSeek(dragTime)
    }
    isDraggingRef.current = false
    setDragTime(null)
  }

  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return '0:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  return (
    <div className="w-full flex flex-col gap-1.5 select-none my-1">
      {/* Waveform Canvas Stage */}
      <div
        className="relative h-16 w-full flex items-center cursor-pointer rounded-2xl bg-[#090b10] border border-white/10 shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)] overflow-hidden px-2"
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
      >
        <canvas
          ref={canvasRef}
          width={600}
          height={64}
          className="w-full h-full block"
        />

        {/* Scrubbing Bubble Preview */}
        {dragTime !== null && (
          <div
            className="absolute top-1 -translate-x-1/2 px-2 py-0.5 rounded-md bg-cyan-500 text-black font-mono font-bold text-[10px] shadow-lg pointer-events-none"
            style={{ left: `${progress * 100}%` }}
          >
            {formatTime(dragTime)}
          </div>
        )}
      </div>

      {/* Time Elapsed & Countdown Display */}
      <div className="flex justify-between items-center text-[11px] font-mono tracking-wider font-semibold px-1">
        <span className="text-cyan-400 drop-shadow-[0_0_6px_rgba(0,229,255,0.5)]">
          {formatTime(effectiveTime)}
        </span>
        <span className="text-zinc-500">
          -{formatTime(Math.max(0, duration - effectiveTime))}
        </span>
      </div>
    </div>
  )
}
