import React, { useEffect, useRef } from 'react'
import { audioEngine } from '../audioEngine'

export function SpectrumVisualizer({ isPlaying = false }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animId

    const drawFrame = () => {
      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)

      const freqData = audioEngine.getFrequencyData()
      const barCount = 36
      const barWidth = (width / barCount) - 2
      const step = Math.floor(freqData.length / barCount) || 1

      for (let i = 0; i < barCount; i++) {
        let val = freqData[i * step] || 0
        if (!isPlaying) val = 8

        const barHeight = Math.max(4, (val / 255) * (height - 8))
        const x = i * (barWidth + 2)
        const y = height - barHeight

        const grad = ctx.createLinearGradient(0, height, 0, 0)
        grad.addColorStop(0, 'rgba(0, 229, 255, 0.4)')
        grad.addColorStop(0.6, 'rgba(0, 229, 255, 0.95)')
        grad.addColorStop(1, 'rgba(168, 85, 247, 1)')

        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0])
        ctx.fill()
      }
    }

    if (isPlaying) {
      const render = () => {
        drawFrame()
        animId = requestAnimationFrame(render)
      }
      render()
    } else {
      drawFrame()
    }

    return () => {
      if (animId) cancelAnimationFrame(animId)
    }
  }, [isPlaying])

  return (
    <div className="w-full h-full flex items-center justify-center p-2">
      <canvas
        ref={canvasRef}
        width={320}
        height={180}
        className="w-full h-full rounded-2xl bg-[#080B10] border border-white/10"
      />
    </div>
  )
}
