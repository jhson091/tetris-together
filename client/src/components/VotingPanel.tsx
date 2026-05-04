'use client'

import { useEffect, useRef, useState } from 'react'
import { VoteState, TetrominoType } from '@/types/game'
import { getShape, PIECE_COLORS } from '@/lib/tetris'

interface Props {
  vote: VoteState
  myId: string
  currentPlayerId: string
  onVote: (piece: TetrominoType) => void
}

const CELL = 14

function MiniPiece({ type }: { type: TetrominoType }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const shape = getShape(type, 0)
    const color = PIECE_COLORS[type]
    const offsetX = Math.floor((4 - shape[0].length) / 2)
    const offsetY = Math.floor((4 - shape.length) / 2)
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue
        ctx.fillStyle = color
        ctx.fillRect((offsetX + c) * CELL + 1, (offsetY + r) * CELL + 1, CELL - 2, CELL - 2)
      }
    }
  }, [type])
  return <canvas ref={canvasRef} width={4 * CELL} height={4 * CELL} />
}

export default function VotingPanel({ vote, myId, currentPlayerId, onVote }: Props) {
  const isCurrentPlayer = myId === currentPlayerId
  const myVote = vote.votes[myId]
  const [timeLeft, setTimeLeft] = useState(Math.max(0, Math.ceil((vote.endsAt - Date.now()) / 1000)))

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(Math.max(0, Math.ceil((vote.endsAt - Date.now()) / 1000)))
    }, 500)
    return () => clearInterval(interval)
  }, [vote.endsAt])

  const voteCounts = vote.candidates.reduce<Record<string, number>>((acc, c) => {
    acc[c] = Object.values(vote.votes).filter(v => v === c).length
    return acc
  }, {})

  if (isCurrentPlayer) {
    return (
      <div className="bg-gray-900 rounded-xl p-3">
        <p className="text-xs text-gray-400 text-center">다른 플레이어들이 다음 블록을 투표 중...</p>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 rounded-xl p-3">
      <div className="flex justify-between items-center mb-2">
        <p className="text-xs font-bold text-yellow-400">블록 투표</p>
        <span className="text-xs text-gray-400">{timeLeft}초</span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {vote.candidates.map((piece) => (
          <button
            key={piece}
            onClick={() => !myVote && onVote(piece)}
            disabled={!!myVote}
            className={`relative rounded p-1 transition-colors ${
              myVote === piece
                ? 'ring-2 ring-cyan-400 bg-gray-700'
                : myVote
                ? 'bg-gray-800 opacity-50'
                : 'bg-gray-800 hover:bg-gray-700'
            }`}
          >
            <MiniPiece type={piece} />
            {voteCounts[piece] > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {voteCounts[piece]}
              </span>
            )}
          </button>
        ))}
      </div>
      {myVote && <p className="text-xs text-center text-green-400 mt-2">투표 완료: {myVote}</p>}
    </div>
  )
}
