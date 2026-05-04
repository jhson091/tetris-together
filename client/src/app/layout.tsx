import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Tetris Together',
  description: '친구들과 함께하는 턴제 테트리스',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full bg-gray-950 text-white">{children}</body>
    </html>
  )
}
