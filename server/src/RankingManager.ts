import { RankingEntry } from './types'

interface RankingInput {
  totalScore: number
  players: { name: string; score: number; color: string }[]
  linesCleared: number
}

class RankingManager {
  private entries: RankingEntry[] = []

  addEntry(input: RankingInput): void {
    const entry: RankingEntry = {
      rank: 0,
      totalScore: input.totalScore,
      players: input.players,
      timestamp: Date.now(),
      linesCleared: input.linesCleared,
    }
    this.entries.push(entry)
    this.entries.sort((a, b) => b.totalScore - a.totalScore)
    if (this.entries.length > 100) this.entries = this.entries.slice(0, 100)
    this.recalcRanks()
  }

  getTop20(): RankingEntry[] {
    return this.entries.slice(0, 20)
  }

  private recalcRanks(): void {
    this.entries.forEach((e, i) => { e.rank = i + 1 })
  }
}

export const rankingManager = new RankingManager()
