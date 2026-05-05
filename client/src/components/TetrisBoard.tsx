'use client'

import { useEffect, useRef } from 'react'
import { Board, Piece, TetrominoType } from '@/types/game'
import { getShape } from '@/lib/tetris'

const BOARD_W = 10
const BOARD_H = 20

interface Props {
  board: Board
  currentPiece: Piece | null
  ghostY: number
  isMyTurn: boolean
  cellSize?: number
}

export default function TetrisBoard({ board, currentPiece, ghostY, isMyTurn, cellSize = 28 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const C = cellSize

    // Background
    ctx.fillStyle = '#111827'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Grid lines
    ctx.strokeStyle = '#1f2937'
    ctx.lineWidth = 0.5
    for (let r = 0; r <= BOARD_H; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * C); ctx.lineTo(BOARD_W * C, r * C); ctx.stroke()
    }
    for (let c = 0; c <= BOARD_W; c++) {
      ctx.beginPath(); ctx.moveTo(c * C, 0); ctx.lineTo(c * C, BOARD_H * C); ctx.stroke()
    }

    // Placed blocks
    for (let r = 0; r < BOARD_H; r++) {
      for (let c = 0; c < BOARD_W; c++) {
        const cell = board[r]?.[c]
        if (!cell) continue
        drawCell(ctx, c, r, cell.color, 1, C)
      }
    }

    // Ghost piece
    if (currentPiece) {
      const shape = getShape(currentPiece.type as TetrominoType, currentPiece.rotation)
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (!shape[r][c]) continue
          drawCell(ctx, currentPiece.x + c, ghostY + r, currentPiece.color, 0.2, C)
        }
      }

      // Current piece
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (!shape[r][c]) continue
          drawCell(ctx, currentPiece.x + c, currentPiece.y + r, currentPiece.color, 1, C)
        }
      }
    }

    // My-turn highlight border
    if (isMyTurn) {
      ctx.strokeStyle = '#22d3ee'
      ctx.lineWidth = 3
      ctx.strokeRect(1.5, 1.5, BOARD_W * C - 3, BOARD_H * C - 3)
    }
  }, [board, currentPiece, ghostY, isMyTurn, cellSize])

  return (
    <canvas
      ref={canvasRef}
      width={BOARD_W * cellSize}
      height={BOARD_H * cellSize}
      className="border border-gray-700 rounded"
      style={{ imageRendering: 'pixelated' }}
    />
  )
}

function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, alpha: number, C: number) {
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.fillRect(x * C + 1, y * C + 1, C - 2, C - 2)

  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(x * C + 1, y * C + 1, C - 2, 3)
  ctx.fillRect(x * C + 1, y * C + 1, 3, C - 2)

  ctx.globalAlpha = 1
}
