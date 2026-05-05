'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { connectSocket, getSocket } from '@/lib/socket'
import { PlayerInfo } from '@/types/game'

export default function RoomContent() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const code = (params.code as string).toUpperCase()
  const playerName = searchParams.get('name') ?? ''

  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [blocksPerTurn, setBlocksPerTurn] = useState(3)
  const [turnTimeSeconds, setTurnTimeSeconds] = useState(20)
  const [isHost, setIsHost] = useState(searchParams.get('host') === '1')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const socket = connectSocket()
    socket.emit('get_state')

    socket.on('connect', () => {
      socket.emit('rejoin_room', { code, playerName })
    })
    socket.on('game_state', (state) => setPlayers(state.players))
    socket.on('settings_updated', (s) => {
      setBlocksPerTurn(s.blocksPerTurn)
      setTurnTimeSeconds(s.turnTimeSeconds)
    })
    socket.on('host_changed', (newHostId) => setIsHost(newHostId === socket.id))
    socket.on('game_started', () => {
      router.push(`/game/${code}?name=${encodeURIComponent(playerName)}`)
    })
    socket.on('room_error', (msg) => setError(msg))

    return () => {
      socket.off('connect')
      socket.off('game_state')
      socket.off('settings_updated')
      socket.off('host_changed')
      socket.off('game_started')
      socket.off('room_error')
    }
  }, [code, playerName, router])

  function handleBlocksPerTurnChange(val: number) {
    setBlocksPerTurn(val)
    getSocket().emit('update_settings', { blocksPerTurn: val, turnTimeSeconds })
  }

  function handleTurnTimeChange(val: number) {
    setTurnTimeSeconds(val)
    getSocket().emit('update_settings', { blocksPerTurn, turnTimeSeconds: val })
  }

  function handleStart() {
    getSocket().emit('start_game')
  }

  function handleCopyCode() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/?join=${code}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-black mb-1">대기실</h1>
          <p className="text-gray-400 text-sm">게임 시작을 기다리는 중...</p>
        </div>

        {/* 방 코드 */}
        <div className="bg-gray-900 rounded-2xl p-5">
          <p className="text-gray-400 text-xs mb-2 text-center">방 코드</p>
          <div className="flex items-center justify-center gap-3">
            <span className="text-4xl font-black tracking-widest font-mono text-cyan-400">{code}</span>
            <button onClick={handleCopyCode} className="text-xs text-gray-400 hover:text-white border border-gray-700 rounded px-2 py-1 transition-colors">
              {copied ? '복사됨!' : '복사'}
            </button>
          </div>
          <button onClick={handleCopyLink} className="w-full mt-3 text-sm text-gray-400 hover:text-cyan-400 transition-colors">
            🔗 링크 공유
          </button>
        </div>

        {/* 플레이어 목록 */}
        <div className="bg-gray-900 rounded-2xl p-5">
          <p className="text-gray-400 text-xs mb-3">참가자 ({players.length}/4)</p>
          <div className="space-y-2">
            {players.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                <span className="font-medium text-white">{p.name}</span>
                {i === 0 && <span className="text-xs text-yellow-400 ml-auto">방장</span>}
              </div>
            ))}
            {Array.from({ length: 4 - players.length }).map((_, i) => (
              <div key={`empty-${i}`} className="flex items-center gap-3 opacity-30">
                <div className="w-3 h-3 rounded-full border border-gray-600 flex-shrink-0" />
                <span className="text-gray-500 text-sm">대기 중...</span>
              </div>
            ))}
          </div>
        </div>

        {/* 게임 설정 */}
        <div className="bg-gray-900 rounded-2xl p-5 space-y-4">
          <p className="text-gray-400 text-xs">게임 설정</p>

          {/* 턴당 블록 수 */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">턴당 블록 수</p>
              <p className="text-xs text-gray-400">한 턴에 놓을 수 있는 블록 개수</p>
            </div>
            {isHost ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleBlocksPerTurnChange(Math.max(1, blocksPerTurn - 1))}
                  disabled={blocksPerTurn <= 1}
                  className="w-8 h-8 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg font-bold text-lg flex items-center justify-center transition-colors"
                >
                  −
                </button>
                <span className="w-8 text-center font-black text-xl text-cyan-400">{blocksPerTurn}</span>
                <button
                  onClick={() => handleBlocksPerTurnChange(Math.min(5, blocksPerTurn + 1))}
                  disabled={blocksPerTurn >= 5}
                  className="w-8 h-8 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg font-bold text-lg flex items-center justify-center transition-colors"
                >
                  +
                </button>
              </div>
            ) : (
              <span className="text-xl font-black text-cyan-400">{blocksPerTurn}개</span>
            )}
          </div>

          {/* 턴 시간 */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">턴 시간</p>
              <p className="text-xs text-gray-400">한 턴의 제한 시간 (10–60초)</p>
            </div>
            {isHost ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleTurnTimeChange(Math.max(10, turnTimeSeconds - 5))}
                  disabled={turnTimeSeconds <= 10}
                  className="w-8 h-8 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg font-bold text-lg flex items-center justify-center transition-colors"
                >
                  −
                </button>
                <span className="w-10 text-center font-black text-xl text-cyan-400">{turnTimeSeconds}s</span>
                <button
                  onClick={() => handleTurnTimeChange(Math.min(60, turnTimeSeconds + 5))}
                  disabled={turnTimeSeconds >= 60}
                  className="w-8 h-8 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg font-bold text-lg flex items-center justify-center transition-colors"
                >
                  +
                </button>
              </div>
            ) : (
              <span className="text-xl font-black text-cyan-400">{turnTimeSeconds}s</span>
            )}
          </div>
        </div>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        {isHost ? (
          <button
            onClick={handleStart}
            disabled={players.length < 2}
            className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-xl font-bold text-lg transition-colors"
          >
            {players.length < 2 ? `최소 2명 필요 (${players.length}/2)` : '게임 시작!'}
          </button>
        ) : (
          <div className="text-center text-gray-400 py-2">
            방장이 게임을 시작할 때까지 기다려주세요
          </div>
        )}
        <button
          onClick={() => { getSocket().emit('leave_room'); router.push('/') }}
          className="w-full py-3 bg-gray-800 hover:bg-gray-700 rounded-xl font-bold transition-colors text-gray-400"
        >
          로비로 나가기
        </button>
      </div>
    </main>
  )
}
