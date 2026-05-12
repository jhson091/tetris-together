import { Server } from 'socket.io'
import {
  Board, DeathAnalysis, GamePhase, GameState, Piece, PlayerInfo,
  RankingEntry, RoomSettings, ServerToClientEvents, ClientToServerEvents,
  TurnHistoryEntry, TetrominoType,
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
const LOCK_DELAY_MS = 500

function getLevel(totalScore: number): number {
  if (totalScore < 3000) return Math.floor(totalScore / 1000) + 1
  return Math.floor((totalScore - 3000) / 500) + 4
}

function getGravityMs(level: number): number {
  return Math.round(1000 * Math.pow(0.9, level - 1))
}
const RECONNECT_GRACE_MS = 5 * 60 * 1000

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
  private gravityTimer: NodeJS.Timeout | null = null
  private lockDelayTimer: NodeJS.Timeout | null = null
  private turnTimeLeft = 0
  private totalLinesCleared = 0

  private turnHistory: TurnHistoryEntry[] = []
  private turnIndex = 0
  private boardAtTurnStart: Board = createEmptyBoard()
  private holesAtTurnStart = 0
  private linesThisTurn = 0

  private rematchVotes: Set<string> = new Set()
  private disconnectTimers: Map<string, NodeJS.Timeout> = new Map()
  private lastGameOver: { analysis: DeathAnalysis; rankings: RankingEntry[] } | null = null

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
    // Cancel any pending disconnect timer
    const timer = this.disconnectTimers.get(socketId)
    if (timer) { clearTimeout(timer); this.disconnectTimers.delete(socketId) }

    const player = this.players.get(socketId)
    if (!player) return
    player.isConnected = false

    if (this.phase === 'playing') {
      const isCurrentPlayer = this.getCurrentPlayerId() === socketId
      const removedIndex = this.playerOrder.indexOf(socketId)
      this.playerOrder = this.playerOrder.filter(id => id !== socketId)
      this.players.delete(socketId)

      if (this.playerOrder.length <= 1) {
        this.endGame('insufficient_players')
        return
      }

      if (isCurrentPlayer) {
        console.log(`[forcedHardDrop] room=${this.code} player=${player.name} reason=grace_period_expired`)
        if (this.currentPiece) {
          const { piece } = hardDrop(this.board, this.currentPiece)
          this.board = lockPiece(this.board, piece)
          const { board, linesCleared } = clearLines(this.board)
          this.board = board
          this.totalLinesCleared += linesCleared
        }
        this.currentPlayerIndex = this.currentPlayerIndex % this.playerOrder.length
        this.startTurn()
      } else if (removedIndex < this.currentPlayerIndex) {
        // Player before current was removed — shift index to keep pointing at same player
        this.currentPlayerIndex--
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

  disconnectPlayer(socketId: string, onExpired: () => void): void {
    const player = this.players.get(socketId)
    if (!player) return
    console.log(`[disconnectPlayer] room=${this.code} player=${player.name} phase=${this.phase} remaining=${this.playerOrder.length - 1}`)

    if (this.phase === 'gameover') {
      this.removePlayer(socketId)
      onExpired()
      return
    }

    // Mark disconnected immediately so UI can reflect this
    player.isConnected = false
    this.broadcastState()

    // Playing phase: 30s grace; waiting phase: 3-minute grace
    const graceMs = this.phase === 'playing' ? 30 * 1000 : 3 * 60 * 1000
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(socketId)
      this.removePlayer(socketId)
      onExpired()
    }, graceMs)
    this.disconnectTimers.set(socketId, timer)

    // If it's the disconnected player's turn, immediately advance to the next player
    if (this.phase === 'playing' && this.getCurrentPlayerId() === socketId) {
      console.log(`[forcedHardDrop] room=${this.code} player=${player.name} reason=disconnect_during_turn`)
      if (this.currentPiece) {
        const { piece } = hardDrop(this.board, this.currentPiece)
        this.board = lockPiece(this.board, piece)
        const { board, linesCleared } = clearLines(this.board)
        this.board = board
        this.totalLinesCleared += linesCleared
      }
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerOrder.length
      this.startTurn()
    }
  }

  findDisconnectedPlayer(playerName: string): string | null {
    for (const [id, player] of this.players.entries()) {
      if (player.name === playerName && !player.isConnected) return id
    }
    return null
  }

  reconnectPlayer(oldSocketId: string, newSocketId: string): PlayerInfo | null {
    const player = this.players.get(oldSocketId)
    if (!player || player.isConnected) return null

    const timer = this.disconnectTimers.get(oldSocketId)
    if (timer) { clearTimeout(timer); this.disconnectTimers.delete(oldSocketId) }

    player.id = newSocketId
    player.isConnected = true
    this.players.delete(oldSocketId)
    this.players.set(newSocketId, player)

    const orderIdx = this.playerOrder.indexOf(oldSocketId)
    if (orderIdx !== -1) this.playerOrder[orderIdx] = newSocketId

    if (this.hostId === oldSocketId) this.hostId = newSocketId

    return player
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

  private advanceToConnectedPlayer(): boolean {
    const total = this.playerOrder.length
    for (let tries = 0; tries < total; tries++) {
      const player = this.players.get(this.getCurrentPlayerId())
      if (player?.isConnected !== false) return true
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerOrder.length
    }
    this.endGame('insufficient_players')
    return false
  }

  private startTurn(): void {
    this.clearTimers()
    if (!this.advanceToConnectedPlayer()) return
    this.turnBlocksLeft = this.settings.blocksPerTurn
    this.turnTimeLeft = this.settings.turnTimeSeconds
    this.boardAtTurnStart = this.board.map(row => [...row])
    this.holesAtTurnStart = countHoles(this.board)
    this.linesThisTurn = 0

    this.spawnNextPiece()
    if (this.phase !== 'playing') return  // endGame() was called during spawn

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

    const gravityMs = getGravityMs(getLevel(this.getTotalScore()))
    this.gravityTimer = setInterval(() => {
      this.gravityTick()
    }, gravityMs)
  }

  private spawnNextPiece(): void {
    if (this.nextPieces.length < NEXT_QUEUE_SIZE) {
      this.nextPieces.push(...generatePieceQueue(10))
    }

    const type = this.nextPieces.shift()!
    const playerId = this.getCurrentPlayerId()
    const player = this.players.get(playerId)
    if (!player) { this.endGame(); return }

    this.currentPiece = spawnPiece(type, playerId, player.color)

    if (!isValidPosition(this.board, this.currentPiece)) {
      this.endGame()
    }
  }

  private gravityTick(): void {
    if (!this.currentPiece) return
    if (isValidPosition(this.board, this.currentPiece, 0, 1)) {
      this.currentPiece = { ...this.currentPiece, y: this.currentPiece.y + 1 }
      if (this.lockDelayTimer) { clearTimeout(this.lockDelayTimer); this.lockDelayTimer = null }
      this.broadcastState()
    } else if (!this.lockDelayTimer) {
      this.startLockDelay()
    }
  }

  private startLockDelay(): void {
    if (this.lockDelayTimer) clearTimeout(this.lockDelayTimer)
    this.lockDelayTimer = setTimeout(() => {
      this.lockDelayTimer = null
      if (this.currentPiece) this.lockAndProcess(false)
    }, LOCK_DELAY_MS)
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
        this.currentPiece = { ...this.currentPiece, x: this.currentPiece.x - 1, rotation: newRot }
      } else if (isValidPosition(this.board, this.currentPiece, 1, 0, newRot)) {
        this.currentPiece = { ...this.currentPiece, x: this.currentPiece.x + 1, rotation: newRot }
      }
    }

    if (this.currentPiece) {
      if (!isValidPosition(this.board, this.currentPiece, 0, 1)) {
        this.startLockDelay()
      } else if (this.lockDelayTimer) {
        // Piece can fall again after move/rotate — cancel premature lock
        clearTimeout(this.lockDelayTimer)
        this.lockDelayTimer = null
      }
    }

    this.broadcastState()
  }

  handleSoftDrop(socketId: string): void {
    if (!this.currentPiece || this.getCurrentPlayerId() !== socketId) return
    if (isValidPosition(this.board, this.currentPiece, 0, 1)) {
      this.currentPiece = { ...this.currentPiece, y: this.currentPiece.y + 1 }
      if (this.lockDelayTimer) { clearTimeout(this.lockDelayTimer); this.lockDelayTimer = null }
      this.broadcastState()
    } else {
      this.startLockDelay()
    }
  }

  handleHardDrop(socketId: string): void {
    if (!this.currentPiece || this.getCurrentPlayerId() !== socketId) return
    this.lockAndProcess(true)
  }

  private autoHardDrop(): void {
    if (!this.currentPiece) return
    const pid = this.getCurrentPlayerId()
    const pname = this.players.get(pid)?.name ?? pid
    console.log(`[autoHardDrop] room=${this.code} player=${pname} reason=turn_timer_expired`)
    this.lockAndProcess(true)
  }

  private lockAndProcess(useHardDrop: boolean): void {
    if (!this.currentPiece) return
    if (this.lockDelayTimer) { clearTimeout(this.lockDelayTimer); this.lockDelayTimer = null }

    const piece = useHardDrop
      ? hardDrop(this.board, this.currentPiece).piece
      : this.currentPiece

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

  handleRematchVote(socketId: string): void {
    if (this.phase !== 'gameover') return
    this.rematchVotes.add(socketId)

    const total = this.playerOrder.length

    if (total < 2) {
      this.io.to(this.code).emit('game_aborted', { reason: 'insufficient_players' })
      return
    }

    this.io.to(this.code).emit('rematch_vote_update', {
      votes: Array.from(this.rematchVotes),
      total,
    })

    if (this.rematchVotes.size >= total) {
      this.resetForRematch()
    }
  }

  private resetForRematch(): void {
    this.io.to(this.code).emit('rematch_start')
    this.phase = 'waiting'
    this.rematchVotes.clear()
    this.lastGameOver = null

    setTimeout(() => {
      if (this.playerOrder.length < 2) {
        this.io.to(this.code).emit('game_aborted', { reason: 'insufficient_players' })
        return
      }
      this.startGame()
    }, 2000)
  }

  private endGame(abortReason?: string): void {
    this.clearTimers()
    this.phase = 'gameover'
    this.currentPiece = null

    if (abortReason === 'insufficient_players') {
      console.log(`[game_aborted] room=${this.code} players_left=${this.playerOrder.length}`)
      this.io.to(this.code).emit('game_aborted', { reason: abortReason })
      this.broadcastState()
      return
    }

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

    this.lastGameOver = { analysis, rankings }
    this.io.to(this.code).emit('game_over', { analysis, rankings })
    this.broadcastState()
  }

  private buildDeathAnalysis(): DeathAnalysis {
    // Build name/color lookup from turn history (survives player disconnect)
    const playerNames: Record<string, string> = {}
    const playerColors: Record<string, string> = {}
    for (const entry of this.turnHistory) {
      playerNames[entry.playerId] = entry.playerName
    }
    for (const [id, player] of this.players.entries()) {
      playerColors[id] = player.color
    }

    // Aggregate per-player stats
    const holesMap: Record<string, number> = {}
    const linesMap: Record<string, number> = {}
    for (const entry of this.turnHistory) {
      holesMap[entry.playerId] = (holesMap[entry.playerId] ?? 0) + entry.holesCreated
      linesMap[entry.playerId] = (linesMap[entry.playerId] ?? 0) + entry.linesCleared
    }

    const playerIds = [...new Set(this.turnHistory.map(e => e.playerId))]
    const playerContributions = playerIds
      .map(id => {
        const holes = holesMap[id] ?? 0
        const lines = linesMap[id] ?? 0
        const p = this.players.get(id)
        return {
          playerId: id,
          playerName: p?.name ?? playerNames[id] ?? 'Unknown',
          color: p?.color ?? playerColors[id] ?? '#ffffff',
          linesCleared: lines,
          holesCreated: holes,
          contributionScore: lines * 2 - holes,
        }
      })
      .sort((a, b) => b.contributionScore - a.contributionScore)

    if (playerContributions.length === 0) {
      return {
        turnHistory: this.turnHistory,
        playerContributions: [],
        mostBlamePlayerIds: [],
        mostBlamePlayerNames: [],
        mvpPlayerIds: [],
        mvpPlayerNames: [],
        totalScore: this.getTotalScore(),
      }
    }

    const maxScore = playerContributions[0].contributionScore
    const minScore = playerContributions[playerContributions.length - 1].contributionScore

    const mvp = playerContributions.filter(c => c.contributionScore === maxScore)
    const blame = playerContributions.filter(c => c.contributionScore === minScore)

    return {
      turnHistory: this.turnHistory,
      playerContributions,
      mostBlamePlayerIds: blame.map(c => c.playerId),
      mostBlamePlayerNames: blame.map(c => c.playerName),
      mvpPlayerIds: mvp.map(c => c.playerId),
      mvpPlayerNames: mvp.map(c => c.playerName),
      totalScore: this.getTotalScore(),
    }
  }

  private getTotalScore(): number {
    return Array.from(this.players.values()).reduce((sum, p) => sum + p.score, 0)
  }

  broadcastChat(socketId: string, text: string): void {
    const player = this.players.get(socketId)
    if (!player) return
    this.io.to(this.code).emit('chat_message', {
      playerId: socketId,
      playerName: player.name,
      color: player.color,
      text,
      timestamp: Date.now(),
    })
  }

  getLastGameOver() {
    return this.lastGameOver
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
      totalScore: this.getTotalScore(),
      blocksPerTurn: this.settings.blocksPerTurn,
      turnTimeSeconds: this.settings.turnTimeSeconds,
    }
  }

  private clearTimers(): void {
    if (this.turnTimer) { clearInterval(this.turnTimer); this.turnTimer = null }
    if (this.gravityTimer) { clearInterval(this.gravityTimer); this.gravityTimer = null }
    if (this.lockDelayTimer) { clearTimeout(this.lockDelayTimer); this.lockDelayTimer = null }
  }

  destroy(): void {
    this.clearTimers()
    for (const timer of this.disconnectTimers.values()) clearTimeout(timer)
    this.disconnectTimers.clear()
  }
}
