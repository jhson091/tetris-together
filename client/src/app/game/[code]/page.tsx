'use client'

import { Suspense } from 'react'
import GameContent from './GameContent'

export default function GamePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">게임 로딩 중...</div>}>
      <GameContent />
    </Suspense>
  )
}
