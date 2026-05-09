'use client'

import { useEffect, useCallback, useState, useRef } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { getSocket } from '@/lib/socket'
import { GameState, DeathAnalysis, RankingEntry, ChatMessage } from '@/types/game'
import TetrisBoard from '@/components/TetrisBoard'
import NextPiecePreview from '@/components/NextPiecePreview'
import GameOverScreen from '@/components/GameOverScreen'
import ChatBox from '@/components/ChatBox'
import DPad from '@/components/DPad'
import RotateButton from '@/components/RotateButton'
import HardDropButton from '@/components/HardDropButton'
import {
  playMove, playRotate, playHardDrop, playClear, playTurnStart, playGameOver,
} from '@/lib/sounds'

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
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [gameAborted, setGameAborted] = useState(false)
  const [vw, setVw] = useState(390)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatOpen, setChatOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const chatOpenRef = useRef(false)
  useEffect(() => { chatOpenRef.current = chatOpen }, [chatOpen])

  useEffect(() => {
    const update = () => setVw(window.innerWidth)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // side panel fixed at 90px; fit board in remaining space
  const PANEL_W = 90
  const cellSize = Math.max(20, Math.min(28, Math.floor((vw - 8 - 12 - PANEL_W) / 10)))
  // 5 equal buttons + 4 gaps of ~btnSize/10 each, within px-4 (32px) padding
  const btnSize = Math.max(44, Math.min(60, Math.floor((vw - 48 - 20) / 5)))
  const btnGap = Math.max(4, Math.floor(btnSize / 11))

  const soundRef = useRef(soundEnabled)
  useEffect(() => { soundRef.current = soundEnabled }, [soundEnabled])

  const prevPlayerIdRef = useRef('')
  const isRejoiningRef = useRef(false)

  useEffect(() => {
    const socket = getSocket()
    if (socket.id) setMyId(socket.id)

    socket.on('connect', () => {
      isRejoiningRef.current = true
      setMyId(socket.id ?? '')
      socket.emit('rejoin_room', { code, playerName })
    })

    socket.emit('get_state')

    socket.on('game_state', (state) => { isRejoiningRef.current = false; setGameState(state) })
    socket.on('room_error', (_msg) => {
      if (isRejoiningRef.current) {
        isRejoiningRef.current = false
        getSocket().emit('leave_room')
        router.push('/')
      }
    })
    socket.on('line_clear', (data) => {
      setLineClearFlash(true)
      setTimeout(() => setLineClearFlash(false), 300)
      if (soundRef.current) playClear(data.lines)
    })
    socket.on('game_over', (data) => {
      setGameOver(data)
      if (soundRef.current) playGameOver()
    })
    socket.on('rematch_vote_update', (data) => setRematchVotes(data))
    socket.on('rematch_start', () => {
      setGameOver(null)
      setRematchVotes(null)
    })
    socket.on('game_aborted', () => setGameAborted(true))
    socket.on('chat_message', (msg) => {
      setChatMessages(prev => [...prev.slice(-99), msg])
      if (!chatOpenRef.current) setUnreadCount(prev => prev + 1)
    })

    return () => {
      socket.off('connect')
      socket.off('game_state')
      socket.off('line_clear')
      socket.off('game_over')
      socket.off('rematch_vote_update')
      socket.off('rematch_start')
      socket.off('game_aborted')
      socket.off('room_error')
      socket.off('chat_message')
    }
  }, [code, playerName])

  // Auto-redirect when game is aborted due to insufficient players
  useEffect(() => {
    if (!gameAborted) return
    const t = setTimeout(() => {
      getSocket().emit('leave_room')
      router.push('/')
    }, 2500)
    return () => clearTimeout(t)
  }, [gameAborted, router])

  // Recovery: if game_state says gameover but game_over event was missed, re-request it
  const recoveryRequestedRef = useRef(false)
  useEffect(() => {
    if (gameState?.phase === 'gameover' && !gameOver && !gameAborted && !recoveryRequestedRef.current) {
      recoveryRequestedRef.current = true
      getSocket().emit('get_state')
    }
    if (gameOver) recoveryRequestedRef.current = false
  }, [gameState?.phase, gameOver, gameAborted])

  // Turn-start notification
  useEffect(() => {
    if (!gameState || gameState.phase !== 'playing') return
    if (
      gameState.currentPlayerId === myId &&
      gameState.currentPlayerId !== prevPlayerIdRef.current
    ) {
      if (soundEnabled) playTurnStart()
    }
    prevPlayerIdRef.current = gameState.currentPlayerId
  }, [gameState?.currentPlayerId, myId, soundEnabled])

  const sendMove = useCallback((direction: 'left' | 'right' | 'rotate') => {
    getSocket().emit('move', { direction })
    if (soundRef.current) {
      if (direction === 'rotate') playRotate()
      else playMove()
    }
  }, [])

  const sendSoftDrop = useCallback(() => {
    getSocket().emit('soft_drop')
    if (soundRef.current) playMove()
  }, [])

  const sendHardDrop = useCallback(() => {
    getSocket().emit('hard_drop')
    if (soundRef.current) playHardDrop()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!gameState || gameState.phase !== 'playing') return
      if (gameState.currentPlayerId !== myId) return

      if (e.key === 'ArrowLeft') { e.preventDefault(); sendMove('left') }
      else if (e.key === 'ArrowRight') { e.preventDefault(); sendMove('right') }
      else if (e.key === 'ArrowUp' || e.key === 'z' || e.key === 'Z') { e.preventDefault(); sendMove('rotate') }
      else if (e.key === 'ArrowDown') { e.preventDefault(); sendSoftDrop() }
      else if (e.key === ' ') { e.preventDefault(); sendHardDrop() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [gameState, myId, sendMove, sendSoftDrop, sendHardDrop])

  function toggleSound() {
    setSoundEnabled(prev => !prev)
  }

  if (gameAborted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
        <div className="text-center space-y-3">
          <p className="text-white text-lg font-medium">플레이 가능한 참가자가 없어서 게임이 중단됩니다.</p>
          <p className="text-gray-400 text-sm">로비로 이동합니다...</p>
        </div>
      </div>
    )
  }

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

  function getLevel(totalScore: number): number {
    if (totalScore < 3000) return Math.floor(totalScore / 1000) + 1
    return Math.floor((totalScore - 3000) / 500) + 4
  }
  const level = getLevel(gameState.totalScore)

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
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="text-yellow-400 font-bold">Lv.{level}</span>
          <span className="text-cyan-400 font-bold">{gameState.totalScore.toLocaleString()}점</span>
          <span>{gameState.totalLinesCleared} lines</span>
          <button
            onClick={toggleSound}
            className="text-base leading-none opacity-60 hover:opacity-100 transition-opacity"
            title={soundEnabled ? '소리 끄기' : '소리 켜기'}
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>
          <button
            onClick={() => { setChatOpen(prev => !prev); setUnreadCount(0) }}
            className="relative text-base leading-none opacity-60 hover:opacity-100 transition-opacity"
            title="채팅"
          >
            💬
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Game area */}
      <div className="flex-1 flex items-end justify-center pt-2 px-2 pb-3 gap-3">
        {/* Board */}
        <div className={`relative transition-all ${lineClearFlash ? 'brightness-150' : ''}`}>
          <TetrisBoard
            board={gameState.board}
            currentPiece={gameState.currentPiece}
            ghostY={gameState.ghostY}
            isMyTurn={isMyTurn}
            cellSize={cellSize}
          />
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-3" style={{ width: PANEL_W }}>
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

          {/* Players */}
          <div className="bg-gray-900 rounded-xl p-2">
            <p className="text-xs text-gray-400 mb-2 text-center">플레이어</p>
            <div className="space-y-1">
              {gameState.players.map(p => (
                <div key={p.id} className={`flex items-center gap-1 ${p.id === gameState.currentPlayerId ? 'opacity-100' : 'opacity-50'}`}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                  <span className={`text-xs truncate ${p.id === myId ? 'font-bold text-white' : 'text-gray-300'}`}>{p.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Settings */}
          <div className="bg-gray-900 rounded-xl p-2 text-center">
            <p className="text-xs text-gray-400 mb-1">설정</p>
            <p className="text-xs text-gray-300">블록 {gameState.blocksPerTurn}개</p>
            <p className="text-xs text-gray-300">{gameState.turnTimeSeconds}초</p>
          </div>
        </div>
      </div>

      {/* Chat */}
      {chatOpen && (
        <ChatBox
          messages={chatMessages}
          myId={myId}
          onSend={(text) => getSocket().emit('send_chat', { text })}
        />
      )}

      {/* Mobile controls */}
      <div className="flex items-center justify-between px-4 pt-1 pb-10 md:hidden">
        <DPad
          translucent
          size={btnSize}
          gap={btnGap}
          onMove={({ dx, held }) => {
            if (!isMyTurn) return
            getSocket().emit('move', { direction: dx === -1 ? 'left' : 'right' })
            if (!held && soundRef.current) playMove()
          }}
          onSoftDrop={(held) => {
            if (!isMyTurn) return
            getSocket().emit('soft_drop')
            if (!held && soundRef.current) playMove()
          }}
        />
        <div className="flex" style={{ gap: btnGap }}>
          <RotateButton
            translucent
            size={btnSize}
            direction="cw"
            onRotate={() => {
              if (!isMyTurn) return
              getSocket().emit('move', { direction: 'rotate' })
              if (soundRef.current) playRotate()
            }}
          />
          <HardDropButton
            translucent
            size={btnSize}
            onHardDrop={() => {
              if (!isMyTurn) return
              getSocket().emit('hard_drop')
              if (soundRef.current) playHardDrop()
            }}
          />
        </div>
      </div>
    </main>
  )
}
