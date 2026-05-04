import { Server } from 'socket.io'
import {
  Board, DeathAnalysis, GamePhase, GameState, Piece, PlayerInfo,
  RoomSettings, ServerToClientEvents, ClientToServerEvents,
  TurnHistoryEntry, VoteState, TetrominoType,
} from './types'
import { rankingManager } from './RankingManager'
import {
  BOARD_WIDTH, PLAYER_COLORS,
  calcScore, calculateGhostY, clearLines, countHoles,
  createEmptyBoard, generatePieceQueue, getRandomPiece,
  hardDrop, isGameOver, isValidPosition, lockPiece, spawnPiece,
} from './TetrisEngine'

type IoServer = Server<ClientToServerEvents, ServerToClientEvents>

const DEFAULT_SETTINGS: RoomSettings = {
  blocksPerTurn: 3,
  turnTimeSeconds: 20,
}

const NEXT_QUEUE_SIZE = 5

export class GameRoom {
  code: string
  private io: IoServer
  private players: Map<string, PlayerInfo> = new Map()
  private playerOrder: string[] = []
  private settings: RoomSettings
  private hostId: string

  private board: Board = createEmptyBoard()
  private currentPiece: Piece | null = null
  private nextPieces: TetrominoType[] = []
  private phase: GamePhase = 'waiting'
  private currentPlayerIndex = 0
  private turnBlocksLeft = 0
  private turnTimer: NodeJS.Timeout | null = null
  private turnTimeLeft = 0
  private totalLinesCleared = 0

  private vote: VoteState | null = null
  private voteTimer: NodeJS.Timeout | null = null

  private turnHistory: TurnHistoryEntry[] = []
  private turnIndex = 0
  private boardAtTurnStart: Board = createEmptyBoard()
  private holesAtTurnStart = 0
  private linesThisTurn = 0

  private rematchVotes: Set<string> = new Set()

  constructor(code: string, io: IoServer, hostId: string, settings?: Partial<RoomSettings>) {
    this.code = code
    this.io = io
    this.hostId = hostId
    this.settings = { ...DEFAULT_SETTINGS, ...settings }
  }

  hasPlayerWithName(name: string): boolean {
    return Array.from(this.players.values()).some(p => p.name === name)
  }

  getSettings(): RoomSettings {
    return { ...this.settings }
  }

  updateSettings(settings: Partial<RoomSettings>): void {
    this.settings = { ...this.settings, ...settings }
    this.io.to(this.code).emit('settings_updated', this.getSettings())
  }

  addPlayer(socketId: string, name: string): PlayerInfo {
    const colorIndex = this.players.size % PLAYER_COLORS.length
    const player: PlayerInfo = {
      id: socketId,
      name,
      color: PLAYER_COLORS[colorIndex],
      score: 0,
      isConnected: true,
      orderIndex: this.players.size,
    }
    this.players.set(socketId, player)
    this.playerOrder.push(socketId)
    return player
  }

  removePlayer(socketId: string): void {
    const player = this.players.get(socketId)
    if (!player) return
    player.isConnected = false

    if (this.phase === 'playing') {
      const isCurrentPlayer = this.getCurrentPlayerId() === socketId
      this.playerOrder = this.playerOrder.filter(id => id !== socketId)
      this.players.delete(socketId)

      if (this.playerOrder.length <= 1) {
        this.endGame()
        return
      }

      if (isCurrentPlayer) {
        if (this.currentPiece) {
          const { piece } = hardDrop(this.board, this.currentPiece)
          this.board = lockPiece(this.board, piece)
          const { board, linesCleared } = clearLines(this.board)
          this.board = board
          this.totalLinesCleared += linesCleared
        }
        this.currentPlayerIndex = this.currentPlayerIndex % this.playerOrder.length
        this.startTurn()
      }
    } else {
      this.playerOrder = this.playerOrder.filter(id => id !== socketId)
      this.players.delete(socketId)

      if (socketId === this.hostId && this.playerOrder.length > 0) {
        this.hostId = this.playerOrder[0]
        this.io.to(this.code).emit('host_changed', this.hostId)
      }
    }

    this.io.to(this.code).emit('player_left', { playerId: socketId, playerName: player.name })
    this.broadcastState()
  }

  getPlayerCount(): number {
    return this.players.size
  }

  isEmpty(): boolean {
    return this.players.size === 0
  }

  isInProgress(): boolean {
    return this.phase === 'playing'
  }

  isFull(): boolean {
    return this.players.size >= 4
  }

  isHost(socketId: string): boolean {
    return this.hostId === socketId
  }

  startGame(): void {
    if (this.phase !== 'waiting' || this.players.size < 2) return
    this.phase = 'playing'
    this.board = createEmptyBoard()
    this.nextPieces = generatePieceQueue(NEXT_QUEUE_SIZE + 10)
    this.currentPlayerIndex = 0
    this.totalLinesCleared = 0
    this.turnHistory = []
    this.turnIndex = 0
    this.rematchVotes.clear()

    for (const player of this.players.values()) {
      player.score = 0
    }

    this.io.to(this.code).emit('game_started')
    this.startTurn()
  }

  private getCurrentPlayerId(): string {
    return this.playerOrder[this.currentPlayerIndex % this.playerOrder.length]
  }

  private startTurn(): void {
    this.clearTimers()
    this.turnBlocksLeft = this.settings.blocksPerTurn
    this.turnTimeLeft = this.settings.turnTimeSeconds
    this.boardAtTurnStart = this.board.map(row => [...row])
    this.holesAtTurnStart = countHoles(this.board)

    this.linesThisTurn = 0
    this.spawnNextPiece()
    this.startVote()
    this.broadcastState()

    this.io.to(this.code).emit('turn_change', {
      currentPlayerId: this.getCurrentPlayerId(),
      turnTimeLeft: this.turnTimeLeft,
      turnBlocksLeft: this.turnBlocksLeft,
    })

    this.turnTimer = setInterval(() => {
      this.turnTimeLeft--
      if (this.turnTimeLeft <= 0) {
        this.autoHardDrop()
      } else {
        this.broadcastState()
      }
    }, 1000)
  }

  private spawnNextPiece(): void {
    if (this.nextPieces.length < NEXT_QUEUE_SIZE) {
      this.nextPieces.push(...generatePieceQueue(10))
    }

    const type = this.nextPieces.shift()!
    const playerId = this.getCurrentPlayerId()
    const player = this.players.get(playerId)!
    this.currentPiece = spawnPiece(type, playerId, player.color)

    if (!isValidPosition(this.board, this.currentPiece)) {
      this.endGame()
    }
  }

  private startVote(): void {
    if (this.voteTimer) clearTimeout(this.voteTimer)

    const candidates: TetrominoType[] = []
    const all: TetrominoType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']
    while (candidates.length < 4) {
      const pick = all[Math.floor(Math.random() * all.length)]
      if (!candidates.includes(pick)) candidates.push(pick)
    }

    this.vote = {
      candidates,
      votes: {},
      endsAt: Date.now() + 10000,
    }

    this.io.to(this.code).emit('vote_start', this.vote)

    this.voteTimer = setTimeout(() => {
      this.resolveVote()
    }, 10000)
  }

  private resolveVote(): void {
    if (!this.vote) return

    const tally: Record<string, number> = {}
    for (const piece of Object.values(this.vote.votes)) {
      tally[piece] = (tally[piece] ?? 0) + 1
    }

    let winner: TetrominoType | null = null
    let maxVotes = 0
    const tied: TetrominoType[] = []

    for (const [piece, count] of Object.entries(tally)) {
      if (count > maxVotes) {
        maxVotes = count
        winner = piece as TetrominoType
        tied.length = 0
        tied.push(piece as TetrominoType)
      } else if (count === maxVotes) {
        tied.push(piece as TetrominoType)
      }
    }

    if (tied.length > 1 || winner === null) {
      const candidates = winner === null ? this.vote.candidates : tied
      winner = candidates[Math.floor(Math.random() * candidates.length)]
    }

    // Inject voted piece as next-next piece (doesn't affect the currently spawned piece)
    if (this.nextPieces.length > 0) {
      this.nextPieces[0] = winner
    } else {
      this.nextPieces.push(winner)
    }

    this.vote = null
  }

  handleMove(socketId: string, direction: 'left' | 'right' | 'rotate'): void {
    if (!this.currentPiece || this.getCurrentPlayerId() !== socketId) return

    if (direction === 'left' && isValidPosition(this.board, this.currentPiece, -1, 0)) {
      this.currentPiece = { ...this.currentPiece, x: this.currentPiece.x - 1 }
    } else if (direction === 'right' && isValidPosition(this.board, this.currentPiece, 1, 0)) {
      this.currentPiece = { ...this.currentPiece, x: this.currentPiece.x + 1 }
    } else if (direction === 'rotate') {
      const newRot = (this.currentPiece.rotation + 1) % 4
      if (isValidPosition(this.board, this.currentPiece, 0, 0, newRot)) {
        this.currentPiece = { ...this.currentPiece, rotation: newRot }
      } else if (isValidPosition(this.board, this.currentPiece, -1, 0, newRot)) {
        // Wall kick left
        this.currentPiece = { ...this.currentPiece, x: this.currentPiece.x - 1, rotation: newRot }
      } else if (isValidPosition(this.board, this.currentPiece, 1, 0, newRot)) {
        // Wall kick right
        this.currentPiece = { ...this.currentPiece, x: this.currentPiece.x + 1, rotation: newRot }
      }
    }

    this.broadcastState()
  }

  handleHardDrop(socketId: string): void {
    if (!this.currentPiece || this.getCurrentPlayerId() !== socketId) return
    this.placePiece()
  }

  private autoHardDrop(): void {
    if (this.currentPiece) this.placePiece()
  }

  private placePiece(): void {
    if (!this.currentPiece) return

    const { piece } = hardDrop(this.board, this.currentPiece)
    this.board = lockPiece(this.board, piece)
    this.currentPiece = null

    if (isGameOver(this.board)) {
      this.endGame()
      return
    }

    const { board, linesCleared } = clearLines(this.board)
    this.board = board
    this.totalLinesCleared += linesCleared
    this.linesThisTurn += linesCleared

    if (linesCleared > 0) {
      const score = calcScore(linesCleared)
      const playerId = this.getCurrentPlayerId()
      const player = this.players.get(playerId)!
      player.score += score
      this.io.to(this.code).emit('line_clear', {
        playerId,
        lines: linesCleared,
        score,
        totalScore: this.getTotalScore(),
      })
    }

    this.turnBlocksLeft--

    if (this.turnBlocksLeft <= 0 || this.turnTimeLeft <= 0) {
      this.endTurn()
    } else {
      this.spawnNextPiece()
      this.broadcastState()
    }
  }

  private endTurn(): void {
    this.clearTimers()

    const holesNow = countHoles(this.board)
    const playerId = this.getCurrentPlayerId()
    const player = this.players.get(playerId)

    this.turnHistory.push({
      turnIndex: this.turnIndex++,
      playerId,
      playerName: player?.name ?? 'Unknown',
      boardSnapshot: this.boardAtTurnStart.map(r => [...r]),
      holesCreated: Math.max(0, holesNow - this.holesAtTurnStart),
      linesCleared: this.linesThisTurn,
      blocksPlaced: this.settings.blocksPerTurn - this.turnBlocksLeft,
    })

    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerOrder.length
    this.startTurn()
  }

  handleVote(socketId: string, piece: TetrominoType): void {
    if (!this.vote || socketId === this.getCurrentPlayerId()) return
    if (!this.vote.candidates.includes(piece)) return

    this.vote.votes[socketId] = piece
    this.io.to(this.code).emit('vote_update', this.vote.votes)
  }

  handleRematchVote(socketId: string): void {
    if (this.phase !== 'gameover') return
    this.rematchVotes.add(socketId)

    const total = this.playerOrder.length
    this.io.to(this.code).emit('rematch_vote_update', {
      votes: Array.from(this.rematchVotes),
      total,
    })

    if (this.rematchVotes.size >= Math.ceil(total / 2)) {
      this.resetForRematch()
    }
  }

  private resetForRematch(): void {
    this.io.to(this.code).emit('rematch_start')
    this.phase = 'waiting'
    this.rematchVotes.clear()

    setTimeout(() => {
      this.startGame()
    }, 2000)
  }

  private endGame(): void {
    this.clearTimers()
    this.phase = 'gameover'
    this.currentPiece = null

    const analysis = this.buildDeathAnalysis()
    const entry = {
      totalScore: this.getTotalScore(),
      players: Array.from(this.players.values()).map(p => ({
        name: p.name,
        score: p.score,
        color: p.color,
      })),
      linesCleared: this.totalLinesCleared,
    }
    rankingManager.addEntry(entry)
    const rankings = rankingManager.getTop20()

    this.io.to(this.code).emit('game_over', { analysis, rankings })
    this.broadcastState()
  }

  private buildDeathAnalysis(): DeathAnalysis {
    const blame: Record<string, number> = {}
    for (const entry of this.turnHistory) {
      blame[entry.playerId] = (blame[entry.playerId] ?? 0) + entry.holesCreated
    }

    let mostBlamePlayerId = ''
    let maxHoles = -1
    for (const [id, holes] of Object.entries(blame)) {
      if (holes > maxHoles) {
        maxHoles = holes
        mostBlamePlayerId = id
      }
    }

    const blamedPlayer = this.players.get(mostBlamePlayerId)
    return {
      turnHistory: this.turnHistory,
      mostBlamePlayerId,
      mostBlamePlayerName: blamedPlayer?.name ?? 'Unknown',
      totalScore: this.getTotalScore(),
    }
  }

  private getTotalScore(): number {
    return Array.from(this.players.values()).reduce((sum, p) => sum + p.score, 0)
  }

  private broadcastState(): void {
    this.io.to(this.code).emit('game_state', this.getState())
  }

  getState(): GameState {
    const ghostY = this.currentPiece
      ? calculateGhostY(this.board, this.currentPiece)
      : 0

    return {
      board: this.board,
      currentPiece: this.currentPiece,
      ghostY,
      nextPieces: this.nextPieces.slice(0, 3),
      currentPlayerId: this.getCurrentPlayerId(),
      turnBlocksLeft: this.turnBlocksLeft,
      turnTimeLeft: this.turnTimeLeft,
      players: Array.from(this.players.values()),
      phase: this.phase,
      totalLinesCleared: this.totalLinesCleared,
      vote: this.vote,
    }
  }

  private clearTimers(): void {
    if (this.turnTimer) { clearInterval(this.turnTimer); this.turnTimer = null }
    if (this.voteTimer) { clearTimeout(this.voteTimer); this.voteTimer = null }
  }

  destroy(): void {
    this.clearTimers()
  }
}
