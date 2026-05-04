'use client'

import { useEffect, useCallback, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { getSocket } from '@/lib/socket'
import { GameState, DeathAnalysis, RankingEntry, TetrominoType } from '@/types/game'
import TetrisBoard from '@/components/TetrisBoard'
import NextPiecePreview from '@/components/NextPiecePreview'
import VotingPanel from '@/components/VotingPanel'
import GameOverScreen from '@/components/GameOverScreen'

export default function GameContent() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const code = (params.code as string).toUpperCase()
  const playerName = searchParams.get('name') ?? ''

  const [gameState, setGameState] = useState<GameState | null>(null)
  const [myId, setMyId] = useState('')
  const [gameOver, setGameOver] = useState<{ analysis: DeathAnalysis; rankings: RankingEntry[] } | null>(null)
  const [rematchVotes, setRematchVotes] = useState<{ votes: string[]; total: number } | null>(null)
  const [lineClearFlash, setLineClearFlash] = useState(false)

  useEffect(() => {
    const socket = getSocket()
    if (socket.id) setMyId(socket.id)
    socket.on('connect', () => setMyId(socket.id ?? ''))
    socket.emit('get_state')

    socket.on('game_state', (state) => setGameState(state))
    socket.on('line_clear', () => {
      setLineClearFlash(true)
      setTimeout(() => setLineClearFlash(false), 300)
    })
    socket.on('game_over', (data) => setGameOver(data))
    socket.on('rematch_vote_update', (data) => setRematchVotes(data))
    socket.on('rematch_start', () => {
      setGameOver(null)
      setRematchVotes(null)
    })

    return () => {
      socket.off('game_state')
      socket.off('line_clear')
      socket.off('game_over')
      socket.off('rematch_vote_update')
      socket.off('rematch_start')
    }
  }, [])

  const sendMove = useCallback((direction: 'left' | 'right' | 'rotate') => {
    getSocket().emit('move', { direction })
  }, [])

  const sendHardDrop = useCallback(() => {
    getSocket().emit('hard_drop')
  }, [])

  const sendVote = useCallback((piece: TetrominoType) => {
    getSocket().emit('vote_block', { piece })
  }, [])

  // Keyboard controls
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!gameState || gameState.phase !== 'playing') return
      if (gameState.currentPlayerId !== myId) return

      if (e.key === 'ArrowLeft') { e.preventDefault(); sendMove('left') }
      else if (e.key === 'ArrowRight') { e.preventDefault(); sendMove('right') }
      else if (e.key === 'ArrowUp' || e.key === 'z' || e.key === 'Z') { e.preventDefault(); sendMove('rotate') }
      else if (e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); sendHardDrop() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [gameState, myId, sendMove, sendHardDrop])

  if (gameOver) {
    return (
      <GameOverScreen
        analysis={gameOver.analysis}
        rankings={gameOver.rankings}
        myId={myId}
        rematchVotes={rematchVotes}
        onRematch={() => getSocket().emit('vote_rematch')}
        onLeave={() => { getSocket().emit('leave_room'); router.push('/') }}
      />
    )
  }

  if (!gameState) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">로딩 중...</div>
  }

  const isMyTurn = gameState.currentPlayerId === myId
  const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayerId)

  return (
    <main className="min-h-screen flex flex-col bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <div className="flex gap-3">
          {gameState.players.map(p => (
            <div key={p.id} className={`flex items-center gap-1 text-sm ${p.id === gameState.currentPlayerId ? 'opacity-100' : 'opacity-40'}`}>
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
              <span className={p.id === myId ? 'font-bold text-white' : 'text-gray-300'}>{p.name}</span>
              <span className="text-xs text-gray-400">{p.score}</span>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-400">{gameState.totalLinesCleared} lines</div>
      </div>

      {/* Game area */}
      <div className="flex-1 flex items-center justify-center p-2 gap-3">
        {/* Board */}
        <div className={`relative transition-all ${lineClearFlash ? 'brightness-150' : ''}`}>
          <TetrisBoard
            board={gameState.board}
            currentPiece={gameState.currentPiece}
            ghostY={gameState.ghostY}
            isMyTurn={isMyTurn}
          />
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-3 w-[100px]">
          {/* Turn info */}
          <div className={`rounded-xl p-3 text-center ${isMyTurn ? 'bg-cyan-900 ring-1 ring-cyan-500' : 'bg-gray-900'}`}>
            <p className="text-xs text-gray-400 mb-1">{isMyTurn ? '내 턴!' : `${currentPlayer?.name ?? ''}의 턴`}</p>
            <p className={`text-2xl font-black ${gameState.turnTimeLeft <= 5 ? 'text-red-400' : 'text-white'}`}>
              {gameState.turnTimeLeft}
            </p>
            <p className="text-xs text-gray-400">블록 {gameState.turnBlocksLeft}개</p>
          </div>

          {/* Next pieces */}
          <div className="bg-gray-900 rounded-xl p-2">
            <p className="text-xs text-gray-400 mb-2 text-center">NEXT</p>
            <div className="space-y-1">
              {gameState.nextPieces.slice(0, 3).map((type, i) => (
                <div key={i} className={`flex justify-center ${i > 0 ? 'opacity-50 scale-90' : ''}`}>
                  <NextPiecePreview type={type} />
                </div>
              ))}
            </div>
          </div>

          {/* Vote */}
          {gameState.vote && (
            <VotingPanel
              vote={gameState.vote}
              myId={myId}
              currentPlayerId={gameState.currentPlayerId}
              onVote={sendVote}
            />
          )}
        </div>
      </div>

      {/* Mobile controls */}
      <div className="flex justify-center gap-2 p-3 pb-5 bg-gray-900 border-t border-gray-800 md:hidden">
        <button
          onPointerDown={() => sendMove('left')}
          className="flex-1 max-w-[70px] h-14 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 rounded-xl text-xl font-bold select-none transition-colors"
        >
          ←
        </button>
        <button
          onPointerDown={() => sendMove('right')}
          className="flex-1 max-w-[70px] h-14 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 rounded-xl text-xl font-bold select-none transition-colors"
        >
          →
        </button>
        <button
          onPointerDown={sendHardDrop}
          className="flex-1 max-w-[80px] h-14 bg-cyan-700 hover:bg-cyan-600 active:bg-cyan-500 rounded-xl text-xl font-bold select-none transition-colors"
        >
          ⬇
        </button>
        <button
          onPointerDown={() => sendMove('rotate')}
          className="flex-1 max-w-[70px] h-14 bg-purple-700 hover:bg-purple-600 active:bg-purple-500 rounded-xl text-xl font-bold select-none transition-colors"
        >
          ↺
        </button>
      </div>
    </main>
  )
}
