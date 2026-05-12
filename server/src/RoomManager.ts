import { Server } from 'socket.io'
import { GameRoom } from './GameRoom'
import { ClientToServerEvents, RoomSettings, ServerToClientEvents } from './types'

type IoServer = Server<ClientToServerEvents, ServerToClientEvents>

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map()
  private socketToRoom: Map<string, string> = new Map()
  private io: IoServer

  constructor(io: IoServer) {
    this.io = io
  }

  createRoom(socketId: string, playerName: string, settings?: Partial<RoomSettings>): { code: string; room: GameRoom } | null {
    if (this.socketToRoom.has(socketId)) return null

    let code: string
    do { code = generateCode() } while (this.rooms.has(code))

    const room = new GameRoom(code, this.io, socketId, settings)
    room.addPlayer(socketId, playerName)
    this.rooms.set(code, room)
    this.socketToRoom.set(socketId, code)
    return { code, room }
  }

  joinRoom(socketId: string, code: string, playerName: string): GameRoom | null {
    if (this.socketToRoom.has(socketId)) return null

    const room = this.rooms.get(code.toUpperCase())
    if (!room) return null
    if (room.isFull()) return null
    if (room.isInProgress()) return null

    room.addPlayer(socketId, playerName)
    this.socketToRoom.set(socketId, code.toUpperCase())
    return room
  }

  leaveRoom(socketId: string): void {
    const code = this.socketToRoom.get(socketId)
    if (!code) return

    const room = this.rooms.get(code)
    if (room) {
      room.removePlayer(socketId)
      if (room.isEmpty()) {
        room.destroy()
        this.rooms.delete(code)
      }
    }
    this.socketToRoom.delete(socketId)
  }

  disconnectPlayer(socketId: string): void {
    const code = this.socketToRoom.get(socketId)
    if (!code) return

    const room = this.rooms.get(code)
    if (!room) { this.socketToRoom.delete(socketId); return }

    room.disconnectPlayer(socketId, () => {
      this.socketToRoom.delete(socketId)
      if (room.isEmpty()) {
        room.destroy()
        this.rooms.delete(code)
      }
    })
  }

  reconnectPlayer(newSocketId: string, code: string, playerName: string): GameRoom | null {
    const upperCode = code.toUpperCase()
    const room = this.rooms.get(upperCode)
    if (!room) return null

    const oldSocketId = room.findDisconnectedPlayer(playerName)
    if (!oldSocketId) return null

    const player = room.reconnectPlayer(oldSocketId, newSocketId)
    if (!player) return null

    this.socketToRoom.delete(oldSocketId)
    this.socketToRoom.set(newSocketId, upperCode)

    return room
  }

  getRoom(socketId: string): GameRoom | null {
    const code = this.socketToRoom.get(socketId)
    if (!code) return null
    return this.rooms.get(code) ?? null
  }

  getRoomByCode(code: string): GameRoom | null {
    return this.rooms.get(code.toUpperCase()) ?? null
  }
}
