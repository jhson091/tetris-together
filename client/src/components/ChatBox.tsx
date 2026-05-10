'use client'

import { useState, useEffect, useRef } from 'react'
import { ChatMessage } from '@/types/game'

interface Props {
  messages: ChatMessage[]
  myId: string
  onSend: (text: string) => void
}

export default function ChatBox({ messages, myId, onSend }: Props) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend() {
    const text = input.trim()
    if (!text) return
    onSend(text)
    setInput('')
    inputRef.current?.focus()
  }

  return (
    <div className="flex flex-col bg-gray-900 border-t border-gray-800" style={{ height: 152 }}>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 min-h-0">
        {messages.length === 0 && (
          <p className="text-xs text-gray-600 text-center pt-2">채팅을 시작해보세요</p>
        )}
        {messages.map((msg) => (
          <div key={msg.timestamp + msg.playerId} className="flex gap-1.5 items-baseline">
            <span
              className="text-xs font-bold flex-shrink-0"
              style={{ color: msg.color }}
            >
              {msg.playerId === myId ? '나' : msg.playerName}
            </span>
            <span className="text-xs text-gray-300 break-all">{msg.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 px-3 py-2 border-t border-gray-800">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') handleSend() }}
          maxLength={60}
          placeholder="메시지 입력..."
          className="flex-1 bg-gray-800 text-white text-sm px-3 py-1.5 rounded-lg placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-600"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors flex-shrink-0"
        >
          전송
        </button>
      </div>
    </div>
  )
}
