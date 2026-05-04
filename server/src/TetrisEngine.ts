import { Board, BoardCell, Piece, TetrominoType } from './types'

export const BOARD_WIDTH = 10
export const BOARD_HEIGHT = 20

// Each piece: array of rotation states, each rotation is a 2D grid (1=filled)
const SHAPES: Record<TetrominoType, number[][][]> = {
  I: [
    [[1, 1, 1, 1]],
    [[1], [1], [1], [1]],
  ],
  O: [
    [[1, 1], [1, 1]],
  ],
  T: [
    [[0, 1, 0], [1, 1, 1]],
    [[1, 0], [1, 1], [1, 0]],
    [[1, 1, 1], [0, 1, 0]],
    [[0, 1], [1, 1], [0, 1]],
  ],
  S: [
    [[0, 1, 1], [1, 1, 0]],
    [[1, 0], [1, 1], [0, 1]],
  ],
  Z: [
    [[1, 1, 0], [0, 1, 1]],
    [[0, 1], [1, 1], [1, 0]],
  ],
  J: [
    [[1, 0, 0], [1, 1, 1]],
    [[1, 1], [1, 0], [1, 0]],
    [[1, 1, 1], [0, 0, 1]],
    [[0, 1], [0, 1], [1, 1]],
  ],
  L: [
    [[0, 0, 1], [1, 1, 1]],
    [[1, 0], [1, 0], [1, 1]],
    [[1, 1, 1], [1, 0, 0]],
    [[1, 1], [0, 1], [0, 1]],
  ],
}

export const PLAYER_COLORS = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A29BFE']

export const TETROMINO_TYPES: TetrominoType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(null))
}

export function getShape(type: TetrominoType, rotation: number): number[][] {
  const rotations = SHAPES[type]
  return rotations[rotation % rotations.length]
}

export function spawnPiece(type: TetrominoType, playerId: string, color: string): Piece {
  const shape = getShape(type, 0)
  const x = Math.floor((BOARD_WIDTH - shape[0].length) / 2)
  return { type, x, y: 0, rotation: 0, playerId, color }
}

export function isValidPosition(board: Board, piece: Piece, dx = 0, dy = 0, newRotation?: number): boolean {
  const rotation = newRotation !== undefined ? newRotation : piece.rotation
  const shape = getShape(piece.type, rotation)
  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (!shape[row][col]) continue
      const nx = piece.x + col + dx
      const ny = piece.y + row + dy
      if (nx < 0 || nx >= BOARD_WIDTH || ny >= BOARD_HEIGHT) return false
      if (ny >= 0 && board[ny][nx] !== null) return false
    }
  }
  return true
}

export function hardDrop(board: Board, piece: Piece): { piece: Piece; ghostY: number } {
  let dy = 0
  while (isValidPosition(board, piece, 0, dy + 1)) dy++
  const dropped = { ...piece, y: piece.y + dy }
  return { piece: dropped, ghostY: piece.y + dy }
}

export function calculateGhostY(board: Board, piece: Piece): number {
  let dy = 0
  while (isValidPosition(board, piece, 0, dy + 1)) dy++
  return piece.y + dy
}

export function lockPiece(board: Board, piece: Piece): Board {
  const newBoard = board.map(row => [...row])
  const shape = getShape(piece.type, piece.rotation)
  const cell: BoardCell = { color: piece.color, playerId: piece.playerId }
  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (!shape[row][col]) continue
      const ny = piece.y + row
      const nx = piece.x + col
      if (ny >= 0 && ny < BOARD_HEIGHT && nx >= 0 && nx < BOARD_WIDTH) {
        newBoard[ny][nx] = { ...cell }
      }
    }
  }
  return newBoard
}

export function clearLines(board: Board): { board: Board; linesCleared: number; clearedRows: number[] } {
  const clearedRows: number[] = []
  const newBoard: Board = []
  for (let row = 0; row < BOARD_HEIGHT; row++) {
    if (board[row].every(cell => cell !== null)) {
      clearedRows.push(row)
    } else {
      newBoard.push([...board[row]])
    }
  }
  const emptyRows = Array.from({ length: clearedRows.length }, () => Array(BOARD_WIDTH).fill(null) as (BoardCell | null)[])
  return {
    board: [...emptyRows, ...newBoard],
    linesCleared: clearedRows.length,
    clearedRows,
  }
}

export function calcScore(lines: number): number {
  const scores: Record<number, number> = { 1: 100, 2: 300, 3: 500, 4: 800 }
  return scores[lines] ?? 0
}

export function countHoles(board: Board): number {
  let holes = 0
  for (let col = 0; col < BOARD_WIDTH; col++) {
    let blockFound = false
    for (let row = 0; row < BOARD_HEIGHT; row++) {
      if (board[row][col] !== null) {
        blockFound = true
      } else if (blockFound) {
        holes++
      }
    }
  }
  return holes
}

export function isGameOver(board: Board): boolean {
  // Game over if any cell in the top 2 rows is filled
  for (let col = 0; col < BOARD_WIDTH; col++) {
    if (board[0][col] !== null || board[1][col] !== null) return true
  }
  return false
}

export function getRandomPiece(): TetrominoType {
  return TETROMINO_TYPES[Math.floor(Math.random() * TETROMINO_TYPES.length)]
}

export function generatePieceQueue(count: number): TetrominoType[] {
  // 7-bag randomizer for fairer distribution
  const queue: TetrominoType[] = []
  while (queue.length < count) {
    const bag = [...TETROMINO_TYPES].sort(() => Math.random() - 0.5)
    queue.push(...bag)
  }
  return queue.slice(0, count)
}
