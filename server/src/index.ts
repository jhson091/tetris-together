import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { RoomManager } from './RoomManager'
import { ClientToServerEvents, ServerToClientEvents } from './types'

const app = express()
app.use(cors())
app.use(express.json())

const httpServer = createServer(app)
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
})

const roomManager = new RoomManager(io)

app.get('/health', (_, res) => res.json({ ok: true }))

app.get('/room/:code', (req, res) => {
  const room = roomManager.getRoomByCode(req.params.code)
  if (!room) return res.status(404).json({ error: 'Room not found' })
  res.json({ code: room.code, playerCount: room.getPlayerCount(), inProgress: room.isInProgress(), full: room.isFull() })
})

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`)

  socket.on('create_room', ({ playerName, settings }) => {
    // Auto-leave any existing room before creating
    if (roomManager.getRoom(socket.id)) {
      roomManager.leaveRoom(socket.id)
      socket.rooms.forEach(r => { if (r !== socket.id) socket.leave(r) })
    }
    const result = roomManager.createRoom(socket.id, playerName, settings)
    if (!result) {
      socket.emit('room_error', '방 생성에 실패했습니다')
      return
    }
    const { code, room } = result
    socket.join(code)
    socket.emit('room_created', { code, playerId: socket.id })
    socket.emit('settings_updated', room.getSettings())
    socket.emit('game_state', room.getState())
  })

  socket.on('join_room', ({ code, playerName }) => {
    // Auto-leave any existing room before joining
    if (roomManager.getRoom(socket.id)) {
      roomManager.leaveRoom(socket.id)
      socket.rooms.forEach(r => { if (r !== socket.id) socket.leave(r) })
    }

    const existing = roomManager.getRoomByCode(code)
    if (existing && existing.hasPlayerWithName(playerName) && !existing.findDisconnectedPlayer(playerName)) {
      socket.emit('room_error', `'${playerName}' 닉네임이 이미 사용 중입니다`)
      return
    }

    const room = roomManager.joinRoom(socket.id, code, playerName)
    if (!room) {
      if (!existing) socket.emit('room_error', '존재하지 않는 방 코드입니다')
      else if (existing.isInProgress()) socket.emit('room_error', '이미 게임이 진행 중인 방입니다')
      else if (existing.isFull()) socket.emit('room_error', '방이 가득 찼습니다 (최대 4명)')
      else socket.emit('room_error', '방 입장에 실패했습니다')
      return
    }

    socket.join(code.toUpperCase())
    const players = room.getState().players
    socket.emit('room_joined', { code: room.code, playerId: socket.id, players })
    socket.emit('settings_updated', room.getSettings())
    socket.to(room.code).emit('player_joined', players.find(p => p.id === socket.id)!)
    io.to(room.code).emit('game_state', room.getState())
  })

  socket.on('rejoin_room', ({ code, playerName }) => {
    const room = roomManager.reconnectPlayer(socket.id, code, playerName)
    if (!room) {
      socket.emit('room_error', '방이 만료되었습니다')
      return
    }

    socket.join(room.code)
    socket.emit('room_joined', { code: room.code, playerId: socket.id, players: room.getState().players })
    socket.emit('settings_updated', room.getSettings())
    if (room.isHost(socket.id)) {
      socket.emit('host_changed', socket.id)
    }
    socket.emit('game_state', room.getState())
    io.to(room.code).emit('game_state', room.getState())
    console.log(`[rejoin] ${playerName} reconnected to room ${code}`)
  })

  socket.on('start_game', () => {
    const room = roomManager.getRoom(socket.id)
    if (!room) return
    if (!room.isHost(socket.id)) {
      socket.emit('room_error', '방장만 게임을 시작할 수 있습니다')
      return
    }
    if (room.getPlayerCount() < 2) {
      socket.emit('room_error', '최소 2명이 필요합니다')
      return
    }
    room.startGame()
  })

  socket.on('get_state', () => {
    const room = roomManager.getRoom(socket.id)
    if (!room) return
    socket.emit('game_state', room.getState())
    const gameOver = room.getLastGameOver()
    if (gameOver) socket.emit('game_over', gameOver)
  })

  socket.on('update_settings', ({ blocksPerTurn, turnTimeSeconds }) => {
    const room = roomManager.getRoom(socket.id)
    if (!room || !room.isHost(socket.id) || room.isInProgress()) return
    room.updateSettings({
      blocksPerTurn: Math.max(1, Math.min(5, blocksPerTurn)),
      turnTimeSeconds: Math.max(10, Math.min(60, turnTimeSeconds)),
    })
  })

  socket.on('move', ({ direction }) => {
    const room = roomManager.getRoom(socket.id)
    room?.handleMove(socket.id, direction)
  })

  socket.on('soft_drop', () => {
    const room = roomManager.getRoom(socket.id)
    room?.handleSoftDrop(socket.id)
  })

  socket.on('hard_drop', () => {
    const room = roomManager.getRoom(socket.id)
    room?.handleHardDrop(socket.id)
  })

  socket.on('vote_rematch', () => {
    const room = roomManager.getRoom(socket.id)
    room?.handleRematchVote(socket.id)
  })

  socket.on('leave_room', () => {
    console.log(`[leave_room] socket=${socket.id}`)
    roomManager.leaveRoom(socket.id)
    socket.rooms.forEach(r => { if (r !== socket.id) socket.leave(r) })
  })

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`)
    roomManager.disconnectPlayer(socket.id)
  })
})

const PORT = process.env.PORT ?? 3001
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
