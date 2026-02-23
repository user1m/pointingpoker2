import type { Room, Player, PlayerDTO, RoomDTO, CardValue, ServerMessage } from '../src/lib/types.js'

// ── In-memory store ──────────────────────────────────────────────────────────

const rooms = new Map<string, Room>()
const peers = new Map<string, { send: (data: string) => void }>()

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

function uniqueCode(): string {
  const existing = new Set([...rooms.values()].map((r) => r.code))
  let code: string
  do {
    code = generateCode()
  } while (existing.has(code))
  return code
}

export function toPlayerDTO(player: Player, revealed: boolean): PlayerDTO {
  return {
    id: player.id,
    name: player.name,
    isHost: player.isHost,
    isActive: player.isActive,
    hasVoted: player.hasVoted,
    vote: revealed ? player.vote : undefined,
  }
}

export function toRoomDTO(room: Room): RoomDTO {
  return {
    id: room.id,
    code: room.code,
    players: [...room.players.values()].map((p) => toPlayerDTO(p, room.revealed)),
    votingOpen: room.votingOpen,
    revealed: room.revealed,
    hostId: room.hostId,
    activeCheck: room.activeCheck ? { deadline: room.activeCheck.deadline } : null,
  }
}

// ── Broadcast helpers ────────────────────────────────────────────────────────

export function sendTo(playerId: string, msg: ServerMessage) {
  const peer = peers.get(playerId)
  if (peer) peer.send(JSON.stringify(msg))
}

export function broadcastToRoom(roomId: string, msg: ServerMessage, excludeId?: string) {
  const room = rooms.get(roomId)
  if (!room) return
  for (const playerId of room.players.keys()) {
    if (playerId === excludeId) continue
    sendTo(playerId, msg)
  }
}

// ── Room CRUD ─────────────────────────────────────────────────────────────────

export function createRoom(hostId: string, hostName: string): Room {
  const roomId = crypto.randomUUID()
  const code = uniqueCode()

  const host: Player = {
    id: hostId,
    name: hostName,
    isHost: true,
    isActive: true,
    vote: null,
    hasVoted: false,
  }

  const room: Room = {
    id: roomId,
    code,
    players: new Map([[hostId, host]]),
    votingOpen: false,
    revealed: false,
    hostId,
    attentionCheckTimer: null,
    activeCheck: null,
  }

  rooms.set(roomId, room)
  scheduleAttentionCheck(roomId)
  return room
}

export function getRoomById(roomId: string): Room | undefined {
  return rooms.get(roomId)
}

export function getRoomByCode(code: string): Room | undefined {
  for (const room of rooms.values()) {
    if (room.code === code) return room
  }
  return undefined
}

export function closeRoom(roomId: string) {
  const room = rooms.get(roomId)
  if (!room) return
  if (room.attentionCheckTimer) clearTimeout(room.attentionCheckTimer)
  rooms.delete(roomId)
}

export function registerPeer(playerId: string, peer: { send: (data: string) => void }) {
  peers.set(playerId, peer)
}

export function unregisterPeer(playerId: string) {
  peers.delete(playerId)
}

// ── Player operations ─────────────────────────────────────────────────────────

export function addPlayerToRoom(room: Room, player: Player) {
  room.players.set(player.id, player)
}

export function removePlayerFromRoom(roomId: string, playerId: string): { roomClosed: boolean } {
  const room = rooms.get(roomId)
  if (!room) return { roomClosed: true }

  room.players.delete(playerId)

  if (room.players.size === 0) {
    closeRoom(roomId)
    return { roomClosed: true }
  }

  // Reassign host if needed
  if (room.hostId === playerId) {
    const newHost = room.players.values().next().value as Player
    newHost.isHost = true
    room.hostId = newHost.id
    broadcastToRoom(roomId, { type: 'HOST_CHANGED', payload: { newHostId: newHost.id } })
  }

  return { roomClosed: false }
}

export function openVoting(room: Room): boolean {
  if (room.votingOpen || room.revealed) return false
  room.votingOpen = true
  return true
}

export function castVote(room: Room, playerId: string, value: CardValue): boolean {
  const player = room.players.get(playerId)
  if (!player || !room.votingOpen) return false
  player.vote = value
  player.hasVoted = true
  return true
}

export function revealVotes(room: Room): Record<string, CardValue | null> {
  room.votingOpen = false
  room.revealed = true
  const votes: Record<string, CardValue | null> = {}
  for (const [id, player] of room.players) {
    votes[id] = player.vote
  }
  return votes
}

export function resetRound(room: Room) {
  room.votingOpen = false
  room.revealed = false
  for (const player of room.players.values()) {
    player.vote = null
    player.hasVoted = false
  }
}

export function assignHost(room: Room, currentHostId: string, newHostId: string): boolean {
  if (room.hostId !== currentHostId) return false
  const oldHost = room.players.get(currentHostId)
  const newHost = room.players.get(newHostId)
  if (!oldHost || !newHost) return false
  oldHost.isHost = false
  newHost.isHost = true
  room.hostId = newHostId
  return true
}

// ── Attention check logic ─────────────────────────────────────────────────────

const CHECK_MIN_MS = 10_000
const CHECK_MAX_MS = 15_000
const CHECK_WINDOW_MS = 15_000

function randomDelay(): number {
  return CHECK_MIN_MS + Math.random() * (CHECK_MAX_MS - CHECK_MIN_MS)
}

export function scheduleAttentionCheck(roomId: string) {
  const room = rooms.get(roomId)
  if (!room) return
  if (room.attentionCheckTimer) clearTimeout(room.attentionCheckTimer)
  room.attentionCheckTimer = setTimeout(() => {
    fireAttentionCheck(roomId)
  }, randomDelay())
}

function fireAttentionCheck(roomId: string) {
  const room = rooms.get(roomId)
  if (!room) return

  // Attention checks only apply during an open voting session, and only to
  // players who haven't voted yet (voted players have already shown presence).
  if (!room.votingOpen) {
    scheduleAttentionCheck(roomId)
    return
  }

  const targetIds = [...room.players.keys()].filter(
    (id) => id !== room.hostId && !room.players.get(id)!.hasVoted,
  )

  if (targetIds.length === 0) {
    scheduleAttentionCheck(roomId)
    return
  }

  const deadline = Date.now() + CHECK_WINDOW_MS
  room.activeCheck = { deadline, respondedIds: new Set(), targetIds: new Set(targetIds) }

  const msg: ServerMessage = { type: 'ATTENTION_CHECK', payload: { deadline } }
  for (const id of targetIds) {
    sendTo(id, msg)
  }

  setTimeout(() => {
    resolveAttentionCheck(roomId)
  }, CHECK_WINDOW_MS)
}

function resolveAttentionCheck(roomId: string) {
  const room = rooms.get(roomId)
  if (!room || !room.activeCheck) return

  const { respondedIds, targetIds } = room.activeCheck
  room.activeCheck = null

  for (const id of targetIds) {
    const player = room.players.get(id)
    if (!player) continue
    if (!respondedIds.has(id)) {
      player.isActive = false
      broadcastToRoom(roomId, {
        type: 'PLAYER_STATUS',
        payload: { playerId: id, isActive: false },
      })
    }
  }

  scheduleAttentionCheck(roomId)
}

export function handleCheckIn(room: Room, playerId: string) {
  if (!room.activeCheck) return
  room.activeCheck.respondedIds.add(playerId)
}

/** Reset all module-level state. Only call from tests. */
export function _resetForTesting() {
  rooms.clear()
  peers.clear()
}

export function handleMarkActive(room: Room, playerId: string) {
  const player = room.players.get(playerId)
  if (!player) return
  player.isActive = true
  broadcastToRoom(room.id, {
    type: 'PLAYER_STATUS',
    payload: { playerId, isActive: true },
  })
}
