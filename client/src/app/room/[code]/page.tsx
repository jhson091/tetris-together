'use client'

import { Suspense } from 'react'
import RoomContent from './RoomContent'

export default function RoomPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">로딩 중...</div>}>
      <RoomContent />
    </Suspense>
  )
}
