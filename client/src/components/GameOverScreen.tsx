'use client'

import { useState } from 'react'
import { DeathAnalysis, RankingEntry } from '@/types/game'

interface Props {
  analysis: DeathAnalysis
  rankings: RankingEntry[]
  myId: string
  rematchVotes: { votes: string[]; total: number } | null
  onRematch: () => void
  onLeave: () => void
}

export default function GameOverScreen({ analysis, rankings, myId, rematchVotes, onRematch, onLeave }: Props) {
  const [tab, setTab] = useState<'analysis' | 'ranking'>('analysis')
  const [voted, setVoted] = useState(false)

  const currentGameScore = analysis.totalScore
  const currentRank = rankings.findIndex(r => r.totalScore === currentGameScore) + 1

  function handleRematch() {
    setVoted(true)
    onRematch()
  }

  return (
    <main className="min-h-screen flex flex-col bg-gray-950">
      <div className="text-center py-8">
        <h1 className="text-3xl font-black mb-1">게임 오버</h1>
        <p className="text-gray-400">총점 <span className="text-cyan-400 font-bold">{currentGameScore.toLocaleString()}</span>점</p>
        {currentRank > 0 && (
          <p className="text-yellow-400 text-sm mt-1">전체 랭킹 #{currentRank}</p>
        )}
      </div>

      {/* Tab */}
      <div className="flex border-b border-gray-800 mx-4">
        <button onClick={() => setTab('analysis')} className={`flex-1 py-2 text-sm font-bold transition-colors ${tab === 'analysis' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400'}`}>
          기여도 분석
        </button>
        <button onClick={() => setTab('ranking')} className={`flex-1 py-2 text-sm font-bold transition-colors ${tab === 'ranking' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400'}`}>
          TOP 20
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'analysis' && (
          <div className="space-y-4">
            {/* Blame */}
            <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-center">
              <p className="text-xs text-red-400 mb-1">가장 많은 구멍을 만든 플레이어</p>
              <p className="text-xl font-black text-red-300">{analysis.mostBlamePlayerName}</p>
              <p className="text-xs text-gray-400 mt-1">이 플레이어 때문에...</p>
            </div>

            {/* Turn summary */}
            <div className="bg-gray-900 rounded-xl p-4">
              <p className="text-sm font-bold mb-3">턴별 구멍 생성</p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {analysis.turnHistory.map((t) => (
                  <div key={t.turnIndex} className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400 w-6 text-xs">#{t.turnIndex + 1}</span>
                    <span className="flex-1 text-gray-300">{t.playerName}</span>
                    <span className={`text-xs ${t.holesCreated > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {t.holesCreated > 0 ? `+${t.holesCreated} 구멍` : '청정'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'ranking' && (
          <div className="space-y-2">
            {rankings.length === 0 && (
              <p className="text-center text-gray-400 py-8">아직 기록이 없습니다</p>
            )}
            {rankings.map((entry) => {
              const isCurrent = entry.totalScore === currentGameScore
              return (
                <div key={entry.timestamp} className={`rounded-xl p-3 ${isCurrent ? 'bg-cyan-950 ring-1 ring-cyan-600' : 'bg-gray-900'}`}>
                  <div className="flex items-center gap-3">
                    <span className={`text-lg font-black w-8 text-center ${entry.rank <= 3 ? 'text-yellow-400' : 'text-gray-400'}`}>
                      #{entry.rank}
                    </span>
                    <div className="flex-1">
                      <div className="flex gap-1 flex-wrap">
                        {entry.players.map((p, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: p.color + '33', color: p.color }}>
                            {p.name} {p.score}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{entry.linesCleared}줄 클리어</p>
                    </div>
                    <span className="text-sm font-bold text-cyan-400">{entry.totalScore.toLocaleString()}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 space-y-2 border-t border-gray-800">
        {rematchVotes && (
          <p className="text-center text-xs text-gray-400">
            리매치 투표: {rematchVotes.votes.length}/{rematchVotes.total}명
          </p>
        )}
        <button
          onClick={handleRematch}
          disabled={voted}
          className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-xl font-bold transition-colors"
        >
          {voted ? '투표 완료!' : '리매치 투표'}
        </button>
        <button
          onClick={onLeave}
          className="w-full py-3 bg-gray-800 hover:bg-gray-700 rounded-xl font-bold transition-colors text-gray-300"
        >
          로비로 나가기
        </button>
      </div>
    </main>
  )
}
