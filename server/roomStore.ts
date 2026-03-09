import type { Room, Player, PlayerDTO, RoomDTO, CardValue, ServerMessage } from '../src/lib/types.js'

// ── In-memory store ──────────────────────────────────────────────────────────

const rooms = new Map<string, Room>()
const peers = new Map<string, { send: (data: string) => void }>()

// Grace period for disconnected players (ms) - allows reconnection without losing state
const GRACE_PERIOD_MS = 5 * 60 * 1000 // 5 minutes
const gracePeriodTimers = new Map<string, ReturnType<typeof setTimeout>>()

// Track disconnected players so they can rejoin with the same ID
const disconnectedPlayers = new Map<string, { roomId: string; player: Player }>()

// Minimum room lifetime (ms) - rooms stay alive for at least this long
const MIN_ROOM_LIFETIME_MS = 60 * 60 * 1000 // 1 hour
const roomCloseTimers = new Map<string, ReturnType<typeof setTimeout>>()

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

  const now = Date.now()
  const room: Room = {
    id: roomId,
    code,
    players: new Map([[hostId, host]]),
    votingOpen: false,
    revealed: false,
    hostId,
    attentionCheckTimer: null,
    activeCheck: null,
    createdAt: now,
    closeTimer: null,
  }

  rooms.set(roomId, room)
  scheduleAttentionCheck(roomId)
  // Schedule room closure after minimum lifetime
  scheduleRoomClosure(roomId, MIN_ROOM_LIFETIME_MS)
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

export function scheduleRoomClosure(roomId: string, delayMs: number) {
  // Cancel any existing close timer
  const existingTimer = roomCloseTimers.get(roomId)
  if (existingTimer) clearTimeout(existingTimer)

  const timer = setTimeout(() => {
    const room = rooms.get(roomId)
    if (!room) return

    // Only close if room is empty (no connected players and no grace period players)
    const hasConnectedPlayers = [...room.players.keys()].some(
      (id) => !gracePeriodTimers.has(id)
    )
    const hasGracePeriodPlayers = [...room.players.keys()].some(
      (id) => gracePeriodTimers.has(id)
    )

    if (!hasConnectedPlayers && !hasGracePeriodPlayers) {
      closeRoom(roomId)
    }
    roomCloseTimers.delete(roomId)
  }, delayMs)

  roomCloseTimers.set(roomId, timer)
}

export function cancelRoomClosure(roomId: string) {
  const timer = roomCloseTimers.get(roomId)
  if (timer) {
    clearTimeout(timer)
    roomCloseTimers.delete(roomId)
  }
}

export function closeRoom(roomId: string) {
  const room = rooms.get(roomId)
  if (!room) return
  if (room.attentionCheckTimer) clearTimeout(room.attentionCheckTimer)

  cancelRoomClosure(roomId)
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

export function removePlayerFromRoom(roomId: string, playerId: string): { roomClosed: boolean; inGracePeriod: boolean } {
  const room = rooms.get(roomId)
  if (!room) return { roomClosed: true, inGracePeriod: false }

  const player = room.players.get(playerId)
  if (!player) return { roomClosed: false, inGracePeriod: false }

  // Check if other players are still connected (not in grace period)
  const connectedPlayers = [...room.players.keys()].filter(
    id => id !== playerId && !gracePeriodTimers.has(id)
  )

  // If this is the last connected player, check if we should close or wait for minimum lifetime
  if (connectedPlayers.length === 0) {
    const roomAge = Date.now() - room.createdAt
    const timeRemaining = MIN_ROOM_LIFETIME_MS - roomAge

    if (timeRemaining <= 0) {
      // Room has existed for at least 1 hour, can close immediately when last player leaves
      // But still respect grace period for other disconnected players
      const gracePeriodPlayers = [...room.players.keys()].filter(
        id => id !== playerId && gracePeriodTimers.has(id)
      )

      if (gracePeriodPlayers.length === 0) {
        // No one in grace period either, close the room
        for (const [id, data] of disconnectedPlayers) {
          if (data.roomId === roomId) {
            const timer = gracePeriodTimers.get(id)
            if (timer) clearTimeout(timer)
            gracePeriodTimers.delete(id)
            disconnectedPlayers.delete(id)
          }
        }
        closeRoom(roomId)
        return { roomClosed: true, inGracePeriod: false }
      }
      // There are grace period players, start grace period for this player too
    } else {
      // Room is younger than 1 hour, schedule closure at the 1-hour mark
      scheduleRoomClosure(roomId, timeRemaining)
    }
  }

  // Start grace period for this player
  // Store player data for potential reconnection
  disconnectedPlayers.set(playerId, { roomId, player })

  const timer = setTimeout(() => {
    // Grace period expired - actually remove the player
    finalizePlayerRemoval(roomId, playerId)
  }, GRACE_PERIOD_MS)

  gracePeriodTimers.set(playerId, timer)

  // Reassign host if needed (immediately, don't wait for grace period)
  if (room.hostId === playerId) {
    // Find first connected player to be new host
    const newHostId = connectedPlayers[0]
    if (newHostId) {
      const newHost = room.players.get(newHostId)!
      newHost.isHost = true
      room.hostId = newHostId
      broadcastToRoom(roomId, { type: 'HOST_CHANGED', payload: { newHostId } })
    }
  }

  return { roomClosed: false, inGracePeriod: true }
}

function finalizePlayerRemoval(roomId: string, playerId: string) {
  const room = rooms.get(roomId)
  if (!room) return

  // Only actually remove if they're still in the room (haven't reconnected)
  room.players.delete(playerId)
  disconnectedPlayers.delete(playerId)
  gracePeriodTimers.delete(playerId)

  // If room is now empty, close it
  if (room.players.size === 0) {
    closeRoom(roomId)
  }
}

export function tryReconnectPlayer(playerId: string): { roomId: string; player: Player } | null {
  const data = disconnectedPlayers.get(playerId)
  if (!data) return null

  // Cancel grace period timer
  const timer = gracePeriodTimers.get(playerId)
  if (timer) clearTimeout(timer)
  gracePeriodTimers.delete(playerId)
  disconnectedPlayers.delete(playerId)

  // Cancel room closure timer since someone is reconnecting
  cancelRoomClosure(data.roomId)

  // Restore player's connection status
  data.player.isActive = true

  return data
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
  // Clear all grace period timers to prevent memory leaks in tests
  for (const timer of gracePeriodTimers.values()) {
    clearTimeout(timer)
  }
  gracePeriodTimers.clear()
  disconnectedPlayers.clear()
  // Clear room close timers
  for (const timer of roomCloseTimers.values()) {
    clearTimeout(timer)
  }
  roomCloseTimers.clear()
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
