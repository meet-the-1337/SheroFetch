import React, { useEffect, useRef } from 'react'
import { audioEngine } from '../audioEngine'

export function SpectrumVisualizer({ isPlaying = false }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animId

    const render = () => {
      animId = requestAnimationFrame(render)
      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)

      const freqData = audioEngine.getFrequencyData()
      const barCount = 36
      const barWidth = (width / barCount) - 2
      const step = Math.floor(freqData.length / barCount) || 1

      for (let i = 0; i < barCount; i++) {
        let val = freqData[i * step] || 0
        if (!isPlaying) val = Math.max(4, Math.sin(Date.now() / 300 + i * 0.3) * 8 + 10)

        const barHeight = Math.max(4, (val / 255) * (height - 8))
        const x = i * (barWidth + 2)
        const y = height - barHeight

        const grad = ctx.createLinearGradient(0, height, 0, 0)
        grad.addColorStop(0, 'rgba(0, 229, 255, 0.4)')
        grad.addColorStop(0.6, 'rgba(0, 229, 255, 0.95)')
        grad.addColorStop(1, 'rgba(168, 85, 247, 1)')

        ctx.fillStyle = grad
        ctx.shadowColor = '#00E5FF'
        ctx.shadowBlur = isPlaying ? 8 : 2
        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0])
        ctx.fill()
      }
    }

    render()
    return () => cancelAnimationFrame(animId)
  }, [isPlaying])

  return (
    <div className="w-full h-full flex items-center justify-center p-2">
      <canvas
        ref={canvasRef}
        width={320}
        height={180}
        className="w-full h-full rounded-2xl bg-black/40 border border-white/10 backdrop-blur-xl"
      />
    </div>
  )
}
