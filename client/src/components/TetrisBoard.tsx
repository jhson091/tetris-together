'use client'

import { useEffect, useRef } from 'react'
import { Board, Piece, TetrominoType } from '@/types/game'
import { getShape } from '@/lib/tetris'

const CELL = 28
const BOARD_W = 10
const BOARD_H = 20

interface Props {
  board: Board
  currentPiece: Piece | null
  ghostY: number
  isMyTurn: boolean
}

export default function TetrisBoard({ board, currentPiece, ghostY, isMyTurn }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Background
    ctx.fillStyle = '#111827'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Grid lines
    ctx.strokeStyle = '#1f2937'
    ctx.lineWidth = 0.5
    for (let r = 0; r <= BOARD_H; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(BOARD_W * CELL, r * CELL); ctx.stroke()
    }
    for (let c = 0; c <= BOARD_W; c++) {
      ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, BOARD_H * CELL); ctx.stroke()
    }

    // Placed blocks
    for (let r = 0; r < BOARD_H; r++) {
      for (let c = 0; c < BOARD_W; c++) {
        const cell = board[r]?.[c]
        if (!cell) continue
        drawCell(ctx, c, r, cell.color, 1)
      }
    }

    // Ghost piece
    if (currentPiece) {
      const shape = getShape(currentPiece.type as TetrominoType, currentPiece.rotation)
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (!shape[r][c]) continue
          drawCell(ctx, currentPiece.x + c, ghostY + r, currentPiece.color, 0.2)
        }
      }

      // Current piece
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (!shape[r][c]) continue
          drawCell(ctx, currentPiece.x + c, currentPiece.y + r, currentPiece.color, 1)
        }
      }
    }

    // My-turn highlight border
    if (isMyTurn) {
      ctx.strokeStyle = '#22d3ee'
      ctx.lineWidth = 3
      ctx.strokeRect(1.5, 1.5, BOARD_W * CELL - 3, BOARD_H * CELL - 3)
    }
  }, [board, currentPiece, ghostY, isMyTurn])

  return (
    <canvas
      ref={canvasRef}
      width={BOARD_W * CELL}
      height={BOARD_H * CELL}
      className="border border-gray-700 rounded"
      style={{ imageRendering: 'pixelated' }}
    />
  )
}

function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, alpha: number) {
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2)

  // Highlight top-left
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, 3)
  ctx.fillRect(x * CELL + 1, y * CELL + 1, 3, CELL - 2)

  ctx.globalAlpha = 1
}
