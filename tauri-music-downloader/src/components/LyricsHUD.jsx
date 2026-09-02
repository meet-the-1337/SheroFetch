import React, { useMemo, useEffect, useRef } from 'react'

export function LyricsHUD({ lrcText = '', currentTime = 0, onSeek }) {
  const scrollRef = useRef(null)
  const activeLineRef = useRef(null)

  // Parse LRC into array of { time: seconds, text: string }
  const lines = useMemo(() => {
    if (!lrcText || typeof lrcText !== 'string') return []
    const parsed = []
    const rawLines = lrcText.split(/\r?\n/)
    const timeRegex = /\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\]/g

    for (const line of rawLines) {
      const match = [...line.matchAll(timeRegex)]
      if (match.length > 0) {
        const text = line.replace(timeRegex, '').trim()
        if (!text) continue
        for (const m of match) {
          const mins = parseFloat(m[1])
          const secs = parseFloat(m[2])
          const totalSecs = mins * 60 + secs
          parsed.push({ time: totalSecs, text })
        }
      }
    }
    return parsed.sort((a, b) => a.time - b.time)
  }, [lrcText])

  // Find active line index based on currentTime
  const activeIndex = useMemo(() => {
    if (lines.length === 0) return -1
    let idx = 0
    for (let i = 0; i < lines.length; i++) {
      if (currentTime >= lines[i].time - 0.2) {
        idx = i
      } else {
        break
      }
    }
    return idx
  }, [lines, currentTime])

  // Smooth auto-scroll active lyric into center of view
  useEffect(() => {
    if (activeLineRef.current && scrollRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
    }
  }, [activeIndex])

  if (lines.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 gap-2 p-6 text-center">
        <span className="text-3xl">🎙️</span>
        <p className="text-sm font-medium">No synchronized lyrics available for this track.</p>
        <p className="text-xs text-zinc-600">SheroFetch automatically fetches synced .lrc upon acquisition.</p>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      className="w-full h-full overflow-y-auto px-4 py-8 space-y-5 select-none no-scrollbar text-center"
      style={{ scrollBehavior: 'smooth' }}
    >
      {lines.map((item, idx) => {
        const isActive = idx === activeIndex
        return (
          <div
            key={idx}
            ref={isActive ? activeLineRef : null}
            onClick={() => onSeek && onSeek(item.time)}
            className={`transition-all duration-300 cursor-pointer py-1 px-3 rounded-xl ${
              isActive
                ? 'text-cyan-300 font-bold text-lg scale-105 drop-shadow-[0_0_12px_rgba(0,229,255,0.7)] bg-cyan-950/20 border border-cyan-500/20'
                : 'text-zinc-400/70 hover:text-zinc-200 text-sm font-medium'
            }`}
          >
            {item.text}
          </div>
        )
      })}
    </div>
  )
}
