import { Suspense } from 'react'
import HomeContent from './HomeContent'

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">로딩 중...</div>}>
      <HomeContent />
    </Suspense>
  )
}
