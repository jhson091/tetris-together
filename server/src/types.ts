export type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'

export interface BoardCell {
  color: string
  playerId: string
}

export type Board = (BoardCell | null)[][]

export interface Piece {
  type: TetrominoType
  x: number
  y: number
  rotation: number
  playerId: string
  color: string
}

export interface PlayerInfo {
  id: string
  name: string
  color: string
  score: number
  isConnected: boolean
  orderIndex: number
}

export type GamePhase = 'waiting' | 'playing' | 'gameover'

export interface TurnHistoryEntry {
  turnIndex: number
  playerId: string
  playerName: string
  boardSnapshot: Board
  holesCreated: number
  linesCleared: number
  blocksPlaced: number
}

export interface GameState {
  board: Board
  currentPiece: Piece | null
  ghostY: number
  nextPieces: TetrominoType[]
  currentPlayerId: string
  turnBlocksLeft: number
  turnTimeLeft: number
  players: PlayerInfo[]
  phase: GamePhase
  totalLinesCleared: number
  totalScore: number
}

export interface PlayerContribution {
  playerId: string
  playerName: string
  color: string
  linesCleared: number
  holesCreated: number
  contributionScore: number
}

export interface DeathAnalysis {
  turnHistory: TurnHistoryEntry[]
  playerContributions: PlayerContribution[]
  mostBlamePlayerIds: string[]
  mostBlamePlayerNames: string[]
  mvpPlayerIds: string[]
  mvpPlayerNames: string[]
  totalScore: number
}

export interface RankingEntry {
  rank: number
  totalScore: number
  players: { name: string; score: number; color: string }[]
  timestamp: number
  linesCleared: number
}

export interface RoomSettings {
  blocksPerTurn: number
  turnTimeSeconds: number
}

export interface MovePayload {
  direction: 'left' | 'right' | 'rotate'
}

export interface CreateRoomPayload {
  playerName: string
  settings?: Partial<RoomSettings>
}

export interface JoinRoomPayload {
  code: string
  playerName: string
}

export interface RejoinRoomPayload {
  code: string
  playerName: string
}

export interface UpdateSettingsPayload {
  blocksPerTurn: number
  turnTimeSeconds: number
}

export interface ServerToClientEvents {
  game_state: (state: GameState) => void
  turn_change: (data: { currentPlayerId: string; turnTimeLeft: number; turnBlocksLeft: number }) => void
  line_clear: (data: { playerId: string; lines: number; score: number; totalScore: number }) => void
  player_left: (data: { playerId: string; playerName: string }) => void
  game_over: (data: { analysis: DeathAnalysis; rankings: RankingEntry[] }) => void
  room_created: (data: { code: string; playerId: string }) => void
  room_joined: (data: { code: string; playerId: string; players: PlayerInfo[] }) => void
  room_error: (message: string) => void
  player_joined: (player: PlayerInfo) => void
  host_changed: (newHostId: string) => void
  game_started: () => void
  rematch_vote_update: (data: { votes: string[]; total: number }) => void
  rematch_start: () => void
  settings_updated: (settings: RoomSettings) => void
}

export interface ClientToServerEvents {
  create_room: (payload: CreateRoomPayload) => void
  join_room: (payload: JoinRoomPayload) => void
  rejoin_room: (payload: RejoinRoomPayload) => void
  start_game: () => void
  move: (payload: MovePayload) => void
  soft_drop: () => void
  hard_drop: () => void
  vote_rematch: () => void
  leave_room: () => void
  get_state: () => void
  update_settings: (payload: UpdateSettingsPayload) => void
}
