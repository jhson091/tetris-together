'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { connectSocket } from '@/lib/socket'

export default function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [playerName, setPlayerName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [mode, setMode] = useState<'home' | 'create' | 'join'>('home')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const pendingRef = useRef(false)

  useEffect(() => {
    const code = searchParams.get('join')
    if (code) {
      setJoinCode(code.toUpperCase())
      setMode('join')
    }
  }, [searchParams])

  function handleCreate() {
    if (!playerName.trim()) { setError('닉네임을 입력해주세요'); return }
    if (pendingRef.current) return
    pendingRef.current = true
    setLoading(true); setError('')
    const socket = connectSocket()
    socket.off('room_created'); socket.off('room_joined'); socket.off('room_error')
    socket.once('room_created', ({ code }) => {
      pendingRef.current = false
      setLoading(false)
      router.push(`/room/${code}?name=${encodeURIComponent(playerName.trim())}&host=1`)
    })
    socket.once('room_error', (msg) => { pendingRef.current = false; setLoading(false); setError(msg) })
    socket.emit('create_room', { playerName: playerName.trim() })
  }

  function handleJoin() {
    if (!playerName.trim()) { setError('닉네임을 입력해주세요'); return }
    if (!joinCode.trim()) { setError('방 코드를 입력해주세요'); return }
    if (pendingRef.current) return
    pendingRef.current = true
    setLoading(true); setError('')
    const socket = connectSocket()
    socket.off('room_created'); socket.off('room_joined'); socket.off('room_error')
    socket.once('room_joined', ({ code }) => {
      pendingRef.current = false
      setLoading(false)
      router.push(`/room/${code}?name=${encodeURIComponent(playerName.trim())}`)
    })
    socket.once('room_error', (msg) => { pendingRef.current = false; setLoading(false); setError(msg) })
    socket.emit('join_room', { code: joinCode.trim().toUpperCase(), playerName: playerName.trim() })
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-black tracking-tight mb-2">
            <span className="text-red-400">T</span><span className="text-yellow-400">E</span>
            <span className="text-green-400">T</span><span className="text-cyan-400">R</span>
            <span className="text-blue-400">I</span><span className="text-purple-400">S</span>
          </h1>
          <p className="text-gray-400 text-sm tracking-widest">TOGETHER</p>
        </div>

        {mode === 'home' && (
          <div className="space-y-3">
            <button onClick={() => setMode('create')} className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-bold text-lg transition-colors">방 만들기</button>
            <button onClick={() => setMode('join')} className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-bold text-lg transition-colors">방 입장하기</button>
          </div>
        )}

        {(mode === 'create' || mode === 'join') && (
          <div className="bg-gray-900 rounded-2xl p-6 space-y-4">
            <button onClick={() => {
              const socket = connectSocket()
              socket.off('room_created'); socket.off('room_joined'); socket.off('room_error')
              pendingRef.current = false
              setLoading(false)
              setError('')
              setMode('home')
            }} className="text-gray-400 hover:text-white text-sm transition-colors">← 뒤로</button>
            <div>
              <label className="block text-sm text-gray-400 mb-1">닉네임</label>
              <input type="text" value={playerName} onChange={e => setPlayerName(e.target.value)} maxLength={12} placeholder="최대 12자"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                onKeyDown={e => { if (e.key === 'Enter') mode === 'create' ? handleCreate() : handleJoin() }} />
            </div>
            {mode === 'join' && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">방 코드</label>
                <input type="text" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={6} placeholder="6자리 코드"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 tracking-widest text-center text-xl font-mono"
                  onKeyDown={e => { if (e.key === 'Enter') handleJoin() }} />
              </div>
            )}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button onClick={mode === 'create' ? handleCreate : handleJoin} disabled={loading}
              className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-xl font-bold text-lg transition-colors flex items-center justify-center gap-2">
              {loading && (
                <svg className="animate-spin w-5 h-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {loading
                ? (mode === 'create' ? '방 만드는 중...' : '입장하는 중...')
                : (mode === 'create' ? '방 만들기' : '입장하기')}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
