'use client'

import { useRef } from 'react'

interface DPadProps {
  translucent?: boolean
  size?: number
  gap?: number
  accent?: string
  onMove: (params: { dx: -1 | 1; held: boolean }) => void
  onSoftDrop: (held: boolean) => void
  onRotate: () => void
}

const DAS_DELAY = 180
const ARR_RATE = 50

export default function DPad({
  translucent = false,
  size = 50,
  gap = 4,
  accent,
  onMove,
  onSoftDrop,
  onRotate,
}: DPadProps) {
  const dasRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const arrRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function clearHeld() {
    if (dasRef.current) { clearTimeout(dasRef.current); dasRef.current = null }
    if (arrRef.current) { clearInterval(arrRef.current); arrRef.current = null }
  }

  function startRepeat(first: () => void, repeat: () => void) {
    clearHeld()
    first()
    dasRef.current = setTimeout(() => {
      arrRef.current = setInterval(repeat, ARR_RATE)
    }, DAS_DELAY)
  }

  const bg = translucent ? 'bg-white/10 active:bg-white/25' : 'bg-gray-700 active:bg-gray-500'
  const btnBase = `flex items-center justify-center rounded-xl text-white/80 select-none touch-none
    border border-white/10 ${bg} transition-colors`

  const s = size

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(3, ${s}px)`,
        gridTemplateRows: `repeat(2, ${s}px)`,
        gap: `${gap}px`,
      }}
    >
      {/* Row 0: only center = rotate */}
      <div style={{ width: s, height: s }} />
      <button
        style={{ width: s, height: s }}
        className={btnBase}
        onPointerDown={(e) => { e.preventDefault(); onRotate() }}
      >
        ↑
      </button>
      <div style={{ width: s, height: s }} />

      {/* Row 1: left, soft-drop, right */}
      <button
        style={{ width: s, height: s }}
        className={btnBase}
        onPointerDown={(e) => {
          e.preventDefault()
          startRepeat(
            () => onMove({ dx: -1, held: false }),
            () => onMove({ dx: -1, held: true }),
          )
        }}
        onPointerUp={clearHeld}
        onPointerCancel={clearHeld}
        onPointerLeave={clearHeld}
      >
        ←
      </button>
      <button
        style={{ width: s, height: s }}
        className={btnBase}
        onPointerDown={(e) => {
          e.preventDefault()
          startRepeat(
            () => onSoftDrop(false),
            () => onSoftDrop(true),
          )
        }}
        onPointerUp={clearHeld}
        onPointerCancel={clearHeld}
        onPointerLeave={clearHeld}
      >
        ↓
      </button>
      <button
        style={{ width: s, height: s }}
        className={btnBase}
        onPointerDown={(e) => {
          e.preventDefault()
          startRepeat(
            () => onMove({ dx: 1, held: false }),
            () => onMove({ dx: 1, held: true }),
          )
        }}
        onPointerUp={clearHeld}
        onPointerCancel={clearHeld}
        onPointerLeave={clearHeld}
      >
        →
      </button>
    </div>
  )
}
