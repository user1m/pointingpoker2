import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import {
  _resetForTesting,
  createRoom,
  getRoomById,
  getRoomByCode,
  addPlayerToRoom,
  removePlayerFromRoom,
  openVoting,
  castVote,
  revealVotes,
  resetRound,
  assignHost,
  handleCheckIn,
  handleMarkActive,
  scheduleAttentionCheck,
  registerPeer,
  unregisterPeer,
  sendTo,
  broadcastToRoom,
  toPlayerDTO,
  toRoomDTO,
} from '../roomStore.js'
import type { Player, Room } from '../../src/lib/types.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-1',
    name: 'Alice',
    isHost: false,
    isActive: true,
    vote: null,
    hasVoted: false,
    ...overrides,
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  _resetForTesting()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// ── createRoom ────────────────────────────────────────────────────────────────

describe('createRoom', () => {
  it('creates a room with a unique ID and 4-char code', () => {
    const room = createRoom('host-1', 'Alice')
    expect(room.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(room.code).toMatch(/^[A-Z0-9]{4}$/)
  })

  it('sets the host player correctly', () => {
    const room = createRoom('host-1', 'Alice')
    const host = room.players.get('host-1')
    expect(host).toBeDefined()
    expect(host!.isHost).toBe(true)
    expect(host!.name).toBe('Alice')
    expect(host!.isActive).toBe(true)
    expect(host!.vote).toBeNull()
    expect(host!.hasVoted).toBe(false)
  })

  it('sets votingOpen to false', () => {
    const room = createRoom('host-1', 'Alice')
    expect(room.votingOpen).toBe(false)
  })

  it('sets revealed to false', () => {
    const room = createRoom('host-1', 'Alice')
    expect(room.revealed).toBe(false)
  })

  it('sets hostId correctly', () => {
    const room = createRoom('host-1', 'Alice')
    expect(room.hostId).toBe('host-1')
  })

  it('generates unique codes for multiple rooms', () => {
    const rooms = Array.from({ length: 10 }, (_, i) => createRoom(`host-${i}`, 'Player'))
    const codes = rooms.map((r) => r.code)
    const uniqueCodes = new Set(codes)
    expect(uniqueCodes.size).toBe(10)
  })

  it('stores the room so it can be retrieved', () => {
    const room = createRoom('host-1', 'Alice')
    expect(getRoomById(room.id)).toBe(room)
  })

  it('schedules an attention check timer', () => {
    const room = createRoom('host-1', 'Alice')
    expect(room.attentionCheckTimer).not.toBeNull()
  })
})

// ── getRoomById / getRoomByCode ───────────────────────────────────────────────

describe('getRoomById', () => {
  it('returns the room for a valid ID', () => {
    const room = createRoom('host-1', 'Alice')
    expect(getRoomById(room.id)).toBe(room)
  })

  it('returns undefined for unknown ID', () => {
    expect(getRoomById('nonexistent')).toBeUndefined()
  })
})

describe('getRoomByCode', () => {
  it('returns the room for a valid code', () => {
    const room = createRoom('host-1', 'Alice')
    expect(getRoomByCode(room.code)).toBe(room)
  })

  it('returns undefined for unknown code', () => {
    expect(getRoomByCode('ZZZZ')).toBeUndefined()
  })
})

// ── addPlayerToRoom ───────────────────────────────────────────────────────────

describe('addPlayerToRoom', () => {
  it('adds a player to the room', () => {
    const room = createRoom('host-1', 'Alice')
    const player = makePlayer({ id: 'player-2', name: 'Bob' })
    addPlayerToRoom(room, player)
    expect(room.players.get('player-2')).toBe(player)
    expect(room.players.size).toBe(2)
  })
})

// ── removePlayerFromRoom ──────────────────────────────────────────────────────

describe('removePlayerFromRoom', () => {
  it('removes a player and returns roomClosed=false when others remain', () => {
    const room = createRoom('host-1', 'Alice')
    const bob = makePlayer({ id: 'player-2', name: 'Bob' })
    addPlayerToRoom(room, bob)

    const result = removePlayerFromRoom(room.id, 'player-2')
    expect(result.roomClosed).toBe(false)
    expect(room.players.has('player-2')).toBe(false)
  })

  it('closes the room when the last player leaves', () => {
    const room = createRoom('host-1', 'Alice')
    const result = removePlayerFromRoom(room.id, 'host-1')
    expect(result.roomClosed).toBe(true)
    expect(getRoomById(room.id)).toBeUndefined()
  })

  it('reassigns host to another player when host leaves', () => {
    const room = createRoom('host-1', 'Alice')
    const bob = makePlayer({ id: 'player-2', name: 'Bob' })
    addPlayerToRoom(room, bob)

    removePlayerFromRoom(room.id, 'host-1')
    expect(room.hostId).toBe('player-2')
    expect(room.players.get('player-2')!.isHost).toBe(true)
  })

  it('does not change host when a non-host leaves', () => {
    const room = createRoom('host-1', 'Alice')
    const bob = makePlayer({ id: 'player-2', name: 'Bob' })
    addPlayerToRoom(room, bob)

    removePlayerFromRoom(room.id, 'player-2')
    expect(room.hostId).toBe('host-1')
  })

  it('returns roomClosed=true for unknown room ID', () => {
    const result = removePlayerFromRoom('nonexistent', 'player-1')
    expect(result.roomClosed).toBe(true)
  })
})

// ── openVoting ────────────────────────────────────────────────────────────────

describe('openVoting', () => {
  it('sets votingOpen to true and returns true', () => {
    const room = createRoom('host-1', 'Alice')
    expect(openVoting(room)).toBe(true)
    expect(room.votingOpen).toBe(true)
  })

  it('returns false if voting is already open', () => {
    const room = createRoom('host-1', 'Alice')
    openVoting(room)
    expect(openVoting(room)).toBe(false)
  })

  it('returns false if votes are already revealed', () => {
    const room = createRoom('host-1', 'Alice')
    openVoting(room)
    revealVotes(room)
    expect(openVoting(room)).toBe(false)
  })
})

// ── castVote ──────────────────────────────────────────────────────────────────

describe('castVote', () => {
  it('records a vote and returns true when voting is open', () => {
    const room = createRoom('host-1', 'Alice')
    openVoting(room)
    const result = castVote(room, 'host-1', '5')
    expect(result).toBe(true)
    expect(room.players.get('host-1')!.vote).toBe('5')
    expect(room.players.get('host-1')!.hasVoted).toBe(true)
  })

  it('rejects a vote when voting is not open and returns false', () => {
    const room = createRoom('host-1', 'Alice')
    // votingOpen is false initially
    const result = castVote(room, 'host-1', '3')
    expect(result).toBe(false)
  })

  it('rejects a vote after reveal (votingOpen closes on reveal) and returns false', () => {
    const room = createRoom('host-1', 'Alice')
    openVoting(room)
    revealVotes(room)
    const result = castVote(room, 'host-1', '3')
    expect(result).toBe(false)
  })

  it('rejects a vote for an unknown player and returns false', () => {
    const room = createRoom('host-1', 'Alice')
    openVoting(room)
    const result = castVote(room, 'unknown-player', '8')
    expect(result).toBe(false)
  })

  it('allows changing a vote while voting is open', () => {
    const room = createRoom('host-1', 'Alice')
    openVoting(room)
    castVote(room, 'host-1', '3')
    castVote(room, 'host-1', '8')
    expect(room.players.get('host-1')!.vote).toBe('8')
  })
})

// ── revealVotes ───────────────────────────────────────────────────────────────

describe('revealVotes', () => {
  it('sets revealed to true and votingOpen to false', () => {
    const room = createRoom('host-1', 'Alice')
    openVoting(room)
    revealVotes(room)
    expect(room.revealed).toBe(true)
    expect(room.votingOpen).toBe(false)
  })

  it('returns a record of all player votes', () => {
    const room = createRoom('host-1', 'Alice')
    const bob = makePlayer({ id: 'player-2', name: 'Bob' })
    addPlayerToRoom(room, bob)

    openVoting(room)
    castVote(room, 'host-1', '5')
    castVote(room, 'player-2', '8')

    const votes = revealVotes(room)
    expect(votes['host-1']).toBe('5')
    expect(votes['player-2']).toBe('8')
  })

  it('includes null for players who did not vote', () => {
    const room = createRoom('host-1', 'Alice')
    const bob = makePlayer({ id: 'player-2', name: 'Bob' })
    addPlayerToRoom(room, bob)

    openVoting(room)
    castVote(room, 'host-1', '5')
    // bob does not vote

    const votes = revealVotes(room)
    expect(votes['player-2']).toBeNull()
  })
})

// ── resetRound ────────────────────────────────────────────────────────────────

describe('resetRound', () => {
  it('clears all votes, sets revealed to false, and sets votingOpen to false', () => {
    const room = createRoom('host-1', 'Alice')
    const bob = makePlayer({ id: 'player-2', name: 'Bob' })
    addPlayerToRoom(room, bob)

    openVoting(room)
    castVote(room, 'host-1', '13')
    castVote(room, 'player-2', '21')
    revealVotes(room)
    resetRound(room)

    expect(room.revealed).toBe(false)
    expect(room.votingOpen).toBe(false)
    for (const player of room.players.values()) {
      expect(player.vote).toBeNull()
      expect(player.hasVoted).toBe(false)
    }
  })
})

// ── assignHost ────────────────────────────────────────────────────────────────

describe('assignHost', () => {
  it('transfers host role to another player and returns true', () => {
    const room = createRoom('host-1', 'Alice')
    const bob = makePlayer({ id: 'player-2', name: 'Bob' })
    addPlayerToRoom(room, bob)

    const result = assignHost(room, 'host-1', 'player-2')
    expect(result).toBe(true)
    expect(room.hostId).toBe('player-2')
    expect(room.players.get('player-2')!.isHost).toBe(true)
    expect(room.players.get('host-1')!.isHost).toBe(false)
  })

  it('returns false if caller is not the current host', () => {
    const room = createRoom('host-1', 'Alice')
    const bob = makePlayer({ id: 'player-2', name: 'Bob' })
    addPlayerToRoom(room, bob)

    const result = assignHost(room, 'player-2', 'host-1')
    expect(result).toBe(false)
    expect(room.hostId).toBe('host-1')
  })

  it('returns false if target player does not exist', () => {
    const room = createRoom('host-1', 'Alice')
    const result = assignHost(room, 'host-1', 'nonexistent')
    expect(result).toBe(false)
  })
})

// ── toPlayerDTO ───────────────────────────────────────────────────────────────

describe('toPlayerDTO', () => {
  it('hides vote when not revealed', () => {
    const player = makePlayer({ id: 'p1', vote: '5', hasVoted: true })
    const dto = toPlayerDTO(player, false)
    expect(dto.vote).toBeUndefined()
    expect(dto.hasVoted).toBe(true)
  })

  it('exposes vote when revealed', () => {
    const player = makePlayer({ id: 'p1', vote: '5', hasVoted: true })
    const dto = toPlayerDTO(player, true)
    expect(dto.vote).toBe('5')
  })

  it('exposes null vote when revealed and player has not voted', () => {
    const player = makePlayer({ id: 'p1', vote: null, hasVoted: false })
    const dto = toPlayerDTO(player, true)
    expect(dto.vote).toBeNull()
  })

  it('includes all non-sensitive fields', () => {
    const player = makePlayer({ id: 'p1', name: 'Alice', isHost: true, isActive: false })
    const dto = toPlayerDTO(player, false)
    expect(dto.id).toBe('p1')
    expect(dto.name).toBe('Alice')
    expect(dto.isHost).toBe(true)
    expect(dto.isActive).toBe(false)
  })
})

// ── toRoomDTO ─────────────────────────────────────────────────────────────────

describe('toRoomDTO', () => {
  it('serializes room to a plain DTO', () => {
    const room = createRoom('host-1', 'Alice')
    const dto = toRoomDTO(room)
    expect(dto.id).toBe(room.id)
    expect(dto.code).toBe(room.code)
    expect(dto.votingOpen).toBe(false)
    expect(dto.revealed).toBe(false)
    expect(dto.hostId).toBe('host-1')
    expect(Array.isArray(dto.players)).toBe(true)
    expect(dto.players).toHaveLength(1)
  })

  it('reflects votingOpen: true after openVoting', () => {
    const room = createRoom('host-1', 'Alice')
    openVoting(room)
    expect(toRoomDTO(room).votingOpen).toBe(true)
  })

  it('sets activeCheck to null when no check is in progress', () => {
    const room = createRoom('host-1', 'Alice')
    room.activeCheck = null
    const dto = toRoomDTO(room)
    expect(dto.activeCheck).toBeNull()
  })

  it('includes deadline when an activeCheck is in progress', () => {
    const room = createRoom('host-1', 'Alice')
    room.activeCheck = { deadline: 9999, respondedIds: new Set() }
    const dto = toRoomDTO(room)
    expect(dto.activeCheck).toEqual({ deadline: 9999 })
  })
})

// ── registerPeer / sendTo / broadcastToRoom ───────────────────────────────────

describe('peer messaging', () => {
  it('sendTo delivers a message to the registered peer', () => {
    const msgs: string[] = []
    registerPeer('p1', { send: (d) => msgs.push(d) })
    sendTo('p1', { type: 'ROUND_RESET', payload: {} })
    expect(msgs).toHaveLength(1)
    expect(JSON.parse(msgs[0])).toEqual({ type: 'ROUND_RESET', payload: {} })
  })

  it('sendTo silently ignores unknown peer IDs', () => {
    expect(() => sendTo('unknown', { type: 'ROUND_RESET', payload: {} })).not.toThrow()
  })

  it('unregisterPeer prevents further message delivery', () => {
    const msgs: string[] = []
    registerPeer('p1', { send: (d) => msgs.push(d) })
    unregisterPeer('p1')
    sendTo('p1', { type: 'ROUND_RESET', payload: {} })
    expect(msgs).toHaveLength(0)
  })

  it('broadcastToRoom sends to all room members', () => {
    const msgs: Record<string, string[]> = { 'host-1': [], 'player-2': [] }
    registerPeer('host-1', { send: (d) => msgs['host-1'].push(d) })
    registerPeer('player-2', { send: (d) => msgs['player-2'].push(d) })

    const room = createRoom('host-1', 'Alice')
    addPlayerToRoom(room, makePlayer({ id: 'player-2', name: 'Bob' }))

    broadcastToRoom(room.id, { type: 'ROUND_RESET', payload: {} })
    expect(msgs['host-1']).toHaveLength(1)
    expect(msgs['player-2']).toHaveLength(1)
  })

  it('broadcastToRoom excludes the specified peer', () => {
    const msgs: Record<string, string[]> = { 'host-1': [], 'player-2': [] }
    registerPeer('host-1', { send: (d) => msgs['host-1'].push(d) })
    registerPeer('player-2', { send: (d) => msgs['player-2'].push(d) })

    const room = createRoom('host-1', 'Alice')
    addPlayerToRoom(room, makePlayer({ id: 'player-2', name: 'Bob' }))

    broadcastToRoom(room.id, { type: 'ROUND_RESET', payload: {} }, 'host-1')
    expect(msgs['host-1']).toHaveLength(0)
    expect(msgs['player-2']).toHaveLength(1)
  })
})

// ── Attention check ───────────────────────────────────────────────────────────

describe('attention check', () => {
  it('fires ATTENTION_CHECK to non-host players after the delay', () => {
    const msgs: Record<string, string[]> = { 'host-1': [], 'player-2': [] }
    registerPeer('host-1', { send: (d) => msgs['host-1'].push(d) })
    registerPeer('player-2', { send: (d) => msgs['player-2'].push(d) })

    const room = createRoom('host-1', 'Alice')
    addPlayerToRoom(room, makePlayer({ id: 'player-2', name: 'Bob' }))
    openVoting(room)
    scheduleAttentionCheck(room.id)

    // Advance past the max possible delay (60 s)
    vi.advanceTimersByTime(15_001)

    const nonHostMsgs = msgs['player-2'].map((m) => JSON.parse(m))
    expect(nonHostMsgs.some((m) => m.type === 'ATTENTION_CHECK')).toBe(true)
  })

  it('does NOT send ATTENTION_CHECK to the host', () => {
    const hostMsgs: string[] = []
    registerPeer('host-1', { send: (d) => hostMsgs.push(d) })
    registerPeer('player-2', { send: () => {} })

    const room = createRoom('host-1', 'Alice')
    addPlayerToRoom(room, makePlayer({ id: 'player-2', name: 'Bob' }))
    openVoting(room)
    scheduleAttentionCheck(room.id)

    vi.advanceTimersByTime(15_001)

    const parsed = hostMsgs.map((m) => JSON.parse(m))
    expect(parsed.some((m) => m.type === 'ATTENTION_CHECK')).toBe(false)
  })

  it('marks non-responding players as inactive after the 30s window', () => {
    registerPeer('host-1', { send: () => {} })
    registerPeer('player-2', { send: () => {} })

    const room = createRoom('host-1', 'Alice')
    addPlayerToRoom(room, makePlayer({ id: 'player-2', name: 'Bob' }))
    openVoting(room)
    scheduleAttentionCheck(room.id)

    // Fire the attention check
    vi.advanceTimersByTime(15_001)
    // Let the 30s window expire without a CHECK_IN
    vi.advanceTimersByTime(15_001)

    expect(room.players.get('player-2')!.isActive).toBe(false)
  })

  it('does NOT mark players who responded as inactive', () => {
    // Pin random so the check delay is exactly CHECK_MIN_MS (10 000 ms),
    // ensuring the resolve timer cannot fire inside the first advanceTimersByTime call.
    vi.spyOn(Math, 'random').mockReturnValue(0)

    registerPeer('host-1', { send: () => {} })
    registerPeer('player-2', { send: () => {} })

    const room = createRoom('host-1', 'Alice')
    addPlayerToRoom(room, makePlayer({ id: 'player-2', name: 'Bob' }))
    openVoting(room)
    scheduleAttentionCheck(room.id)

    // Fire the attention check (delay is pinned to 10 000 ms)
    vi.advanceTimersByTime(10_001)
    // Player responds before the 15 s window closes
    handleCheckIn(room, 'player-2')
    // Window expires
    vi.advanceTimersByTime(15_001)

    expect(room.players.get('player-2')!.isActive).toBe(true)
  })

  it('broadcasts PLAYER_STATUS inactive for non-responders', () => {
    const broadcastedMsgs: string[] = []
    registerPeer('host-1', { send: (d) => broadcastedMsgs.push(d) })
    registerPeer('player-2', { send: () => {} })

    const room = createRoom('host-1', 'Alice')
    addPlayerToRoom(room, makePlayer({ id: 'player-2', name: 'Bob' }))
    openVoting(room)
    scheduleAttentionCheck(room.id)

    vi.advanceTimersByTime(15_001)
    vi.advanceTimersByTime(15_001)

    const parsed = broadcastedMsgs.map((m) => JSON.parse(m))
    const statusMsg = parsed.find(
      (m) => m.type === 'PLAYER_STATUS' && m.payload.playerId === 'player-2',
    )
    expect(statusMsg).toBeDefined()
    expect(statusMsg.payload.isActive).toBe(false)
  })

  it('reschedules the check after resolution', () => {
    registerPeer('host-1', { send: () => {} })
    registerPeer('player-2', { send: () => {} })

    const room = createRoom('host-1', 'Alice')
    addPlayerToRoom(room, makePlayer({ id: 'player-2', name: 'Bob' }))
    openVoting(room)
    scheduleAttentionCheck(room.id)

    vi.advanceTimersByTime(15_001) // fire check
    vi.advanceTimersByTime(15_001) // resolve check

    // After resolution a new timer must have been scheduled
    expect(room.attentionCheckTimer).not.toBeNull()
  })

  it('skips firing and reschedules immediately if room only has the host', () => {
    registerPeer('host-1', { send: () => {} })

    const room = createRoom('host-1', 'Alice')
    scheduleAttentionCheck(room.id)

    // No non-host players — check fires but immediately reschedules
    vi.advanceTimersByTime(15_001)

    expect(room.activeCheck).toBeNull()
    expect(room.attentionCheckTimer).not.toBeNull()
  })

  it('sends ATTENTION_CHECK only to players who have NOT voted when voting is open', () => {
    const msgs: Record<string, string[]> = { 'host-1': [], 'player-2': [], 'player-3': [] }
    registerPeer('host-1', { send: (d) => msgs['host-1'].push(d) })
    registerPeer('player-2', { send: (d) => msgs['player-2'].push(d) })
    registerPeer('player-3', { send: (d) => msgs['player-3'].push(d) })

    const room = createRoom('host-1', 'Alice')
    addPlayerToRoom(room, makePlayer({ id: 'player-2', name: 'Bob' }))
    addPlayerToRoom(room, makePlayer({ id: 'player-3', name: 'Carol' }))

    openVoting(room)
    castVote(room, 'player-2', '5') // player-2 has voted
    // player-3 has NOT voted

    scheduleAttentionCheck(room.id)
    vi.advanceTimersByTime(15_001)

    const p2Msgs = msgs['player-2'].map((m) => JSON.parse(m))
    const p3Msgs = msgs['player-3'].map((m) => JSON.parse(m))

    expect(p2Msgs.some((m) => m.type === 'ATTENTION_CHECK')).toBe(false)
    expect(p3Msgs.some((m) => m.type === 'ATTENTION_CHECK')).toBe(true)
  })

  it('does NOT mark a player who voted as inactive when they ignore the check', () => {
    registerPeer('host-1', { send: () => {} })
    registerPeer('player-2', { send: () => {} })
    registerPeer('player-3', { send: () => {} })

    const room = createRoom('host-1', 'Alice')
    addPlayerToRoom(room, makePlayer({ id: 'player-2', name: 'Bob' }))
    addPlayerToRoom(room, makePlayer({ id: 'player-3', name: 'Carol' }))

    openVoting(room)
    castVote(room, 'player-2', '5') // player-2 voted — should be exempt
    // player-3 has NOT voted

    scheduleAttentionCheck(room.id)
    vi.advanceTimersByTime(15_001) // fire check
    vi.advanceTimersByTime(15_001) // resolve without any CHECK_IN

    expect(room.players.get('player-2')!.isActive).toBe(true)  // voted — never targeted
    expect(room.players.get('player-3')!.isActive).toBe(false) // not voted — was targeted
  })

  it('skips firing and reschedules when voting is open but all non-host players have voted', () => {
    registerPeer('host-1', { send: () => {} })
    registerPeer('player-2', { send: () => {} })

    const room = createRoom('host-1', 'Alice')
    addPlayerToRoom(room, makePlayer({ id: 'player-2', name: 'Bob' }))

    openVoting(room)
    castVote(room, 'player-2', '8') // everyone has voted

    scheduleAttentionCheck(room.id)
    vi.advanceTimersByTime(15_001)

    expect(room.activeCheck).toBeNull()
    expect(room.attentionCheckTimer).not.toBeNull()
  })

  it('skips firing and reschedules when voting is NOT open', () => {
    const msgs: Record<string, string[]> = { 'player-2': [] }
    registerPeer('host-1', { send: () => {} })
    registerPeer('player-2', { send: (d) => msgs['player-2'].push(d) })

    const room = createRoom('host-1', 'Alice')
    addPlayerToRoom(room, makePlayer({ id: 'player-2', name: 'Bob' }))
    // votingOpen is false — checks should be skipped entirely

    scheduleAttentionCheck(room.id)
    vi.advanceTimersByTime(15_001)

    const p2Msgs = msgs['player-2'].map((m) => JSON.parse(m))
    expect(p2Msgs.some((m) => m.type === 'ATTENTION_CHECK')).toBe(false)
    expect(room.activeCheck).toBeNull()
    expect(room.attentionCheckTimer).not.toBeNull()
  })
})

// ── handleCheckIn ─────────────────────────────────────────────────────────────

describe('handleCheckIn', () => {
  it('records the player as having responded', () => {
    const room = createRoom('host-1', 'Alice')
    room.activeCheck = { deadline: Date.now() + 30_000, respondedIds: new Set() }

    handleCheckIn(room, 'host-1')
    expect(room.activeCheck.respondedIds.has('host-1')).toBe(true)
  })

  it('is a no-op when no active check exists', () => {
    const room = createRoom('host-1', 'Alice')
    expect(() => handleCheckIn(room, 'host-1')).not.toThrow()
  })
})

// ── handleMarkActive ──────────────────────────────────────────────────────────

describe('handleMarkActive', () => {
  it('sets the player as active and broadcasts PLAYER_STATUS', () => {
    const broadcastedMsgs: string[] = []
    registerPeer('host-1', { send: (d) => broadcastedMsgs.push(d) })

    const room = createRoom('host-1', 'Alice')
    room.players.get('host-1')!.isActive = false

    handleMarkActive(room, 'host-1')

    expect(room.players.get('host-1')!.isActive).toBe(true)
    const parsed = broadcastedMsgs.map((m) => JSON.parse(m))
    const statusMsg = parsed.find((m) => m.type === 'PLAYER_STATUS')
    expect(statusMsg).toBeDefined()
    expect(statusMsg.payload.isActive).toBe(true)
    expect(statusMsg.payload.playerId).toBe('host-1')
  })

  it('is a no-op for unknown player IDs', () => {
    const room = createRoom('host-1', 'Alice')
    expect(() => handleMarkActive(room, 'unknown')).not.toThrow()
  })
})
