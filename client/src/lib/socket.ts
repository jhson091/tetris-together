import { io, Socket } from 'socket.io-client'
import { ClientToServerEvents, ServerToClientEvents } from '@/types/game'

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3001'

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    socket = io(SERVER_URL, { autoConnect: false })
  }
  return socket
}

export function connectSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  const s = getSocket()
  if (!s.connected) s.connect()
  return s
}

export function disconnectSocket(): void {
  socket?.disconnect()
  socket = null
}
