'use client'

import { useEffect, useRef } from 'react'
import { TetrominoType } from '@/types/game'
import { getShape, PIECE_COLORS } from '@/lib/tetris'

const CELL = 18

interface Props {
  type: TetrominoType
}

export default function NextPiecePreview({ type }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#111827'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const shape = getShape(type, 0)
    const color = PIECE_COLORS[type]
    const offsetX = Math.floor((4 - shape[0].length) / 2)
    const offsetY = Math.floor((4 - shape.length) / 2)

    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue
        const x = (offsetX + c) * CELL + 1
        const y = (offsetY + r) * CELL + 1
        ctx.fillStyle = color
        ctx.fillRect(x, y, CELL - 2, CELL - 2)
        ctx.fillStyle = 'rgba(255,255,255,0.25)'
        ctx.fillRect(x, y, CELL - 2, 3)
        ctx.fillRect(x, y, 3, CELL - 2)
      }
    }
  }, [type])

  return <canvas ref={canvasRef} width={4 * CELL} height={4 * CELL} className="rounded" />
}
