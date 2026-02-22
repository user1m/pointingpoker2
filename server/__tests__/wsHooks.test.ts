/**
 * Integration-style tests for the WebSocket message protocol (wsHooks).
 * A fake Peer captures outgoing messages; we drive the handlers directly.
 */
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { wsHooks, _resetForTesting as resetHooks } from '../wsHooks.js'
import {
  _resetForTesting as resetStore,
  getRoomById,
  registerPeer,
} from '../roomStore.js'

// ── Fake peer helpers ─────────────────────────────────────────────────────────

interface SentMessage {
  type: string
  payload: Record<string, unknown>
}

class FakePeer {
  id: string
  private _sent: string[] = []

  constructor(id: string) {
    this.id = id
  }

  send(data: string) {
    this._sent.push(data)
  }

  messages(): SentMessage[] {
    return this._sent.map((d) => JSON.parse(d) as SentMessage)
  }

  lastMessage(): SentMessage | undefined {
    const msgs = this.messages()
    return msgs[msgs.length - 1]
  }

  messagesOfType(type: string): SentMessage[] {
    return this.messages().filter((m) => m.type === type)
  }

  clear() {
    this._sent = []
  }
}

function text(obj: unknown): { text(): string } {
  return { text: () => JSON.stringify(obj) }
}

function openPeer(peer: FakePeer) {
  wsHooks.open(peer)
}

function closePeer(peer: FakePeer) {
  wsHooks.close(peer)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function send(peer: FakePeer, msg: any) {
  wsHooks.message(peer, text(msg))
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetStore()
  resetHooks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// ── JOIN — create room ────────────────────────────────────────────────────────

describe('JOIN — create new room', () => {
  it('sends ROOM_STATE back to the host when no roomId or code provided', () => {
    const alice = new FakePeer('alice')
    openPeer(alice)
    send(alice, { type: 'JOIN', payload: { name: 'Alice' } })

    const msg = alice.lastMessage()
    expect(msg?.type).toBe('ROOM_STATE')
    expect(msg?.payload.playerId).toBe('alice')
    expect((msg?.payload.room as { hostId: string }).hostId).toBe('alice')
  })

  it('creates a room that is retrievable by ID', () => {
    const alice = new FakePeer('alice')
    openPeer(alice)
    send(alice, { type: 'JOIN', payload: { name: 'Alice' } })

    const roomId = (alice.lastMessage()!.payload.room as { id: string }).id
    expect(getRoomById(roomId)).toBeDefined()
  })

  it('returns ERROR when name is empty', () => {
    const alice = new FakePeer('alice')
    openPeer(alice)
    send(alice, { type: 'JOIN', payload: { name: '' } })

    const msg = alice.lastMessage()
    expect(msg?.type).toBe('ERROR')
  })

  it('returns ERROR when name is whitespace only', () => {
    const alice = new FakePeer('alice')
    openPeer(alice)
    send(alice, { type: 'JOIN', payload: { name: '   ' } })

    expect(alice.lastMessage()?.type).toBe('ERROR')
  })
})

// ── JOIN — join by code ───────────────────────────────────────────────────────

describe('JOIN — join by code', () => {
  it('sends ROOM_STATE to the joiner and PLAYER_JOINED to existing members', () => {
    const alice = new FakePeer('alice')
    const bob = new FakePeer('bob')
    openPeer(alice)
    openPeer(bob)

    send(alice, { type: 'JOIN', payload: { name: 'Alice' } })
    const roomCode = (alice.lastMessage()!.payload.room as { code: string }).code
    alice.clear()

    send(bob, { type: 'JOIN', payload: { name: 'Bob', code: roomCode } })

    expect(bob.lastMessage()?.type).toBe('ROOM_STATE')
    expect(alice.messagesOfType('PLAYER_JOINED')).toHaveLength(1)
  })

  it('PLAYER_JOINED payload includes the new player', () => {
    const alice = new FakePeer('alice')
    const bob = new FakePeer('bob')
    openPeer(alice)
    openPeer(bob)

    send(alice, { type: 'JOIN', payload: { name: 'Alice' } })
    const roomCode = (alice.lastMessage()!.payload.room as { code: string }).code

    send(bob, { type: 'JOIN', payload: { name: 'Bob', code: roomCode } })

    const joinedMsg = alice.messagesOfType('PLAYER_JOINED')[0]
    expect((joinedMsg.payload.player as { name: string }).name).toBe('Bob')
  })

  it('code lookup is case-insensitive (lowercased input works)', () => {
    const alice = new FakePeer('alice')
    const bob = new FakePeer('bob')
    openPeer(alice)
    openPeer(bob)

    send(alice, { type: 'JOIN', payload: { name: 'Alice' } })
    const roomCode = (alice.lastMessage()!.payload.room as { code: string }).code

    send(bob, { type: 'JOIN', payload: { name: 'Bob', code: roomCode.toLowerCase() } })
    expect(bob.lastMessage()?.type).toBe('ROOM_STATE')
  })

  it('creates a new room when the code does not exist', () => {
    const alice = new FakePeer('alice')
    openPeer(alice)
    send(alice, { type: 'JOIN', payload: { name: 'Alice', code: 'ZZZZ' } })
    // ZZZZ doesn't exist — falls through to room creation
    expect(alice.lastMessage()?.type).toBe('ROOM_STATE')
  })
})

// ── JOIN — join by roomId ─────────────────────────────────────────────────────

describe('JOIN — join by roomId', () => {
  it('joins the correct room when a valid roomId is supplied', () => {
    const alice = new FakePeer('alice')
    const bob = new FakePeer('bob')
    openPeer(alice)
    openPeer(bob)

    send(alice, { type: 'JOIN', payload: { name: 'Alice' } })
    const roomId = (alice.lastMessage()!.payload.room as { id: string }).id

    send(bob, { type: 'JOIN', payload: { name: 'Bob', roomId } })
    const bobState = bob.lastMessage()!.payload.room as { id: string }
    expect(bobState.id).toBe(roomId)
  })
})

// ── OPEN_VOTING ───────────────────────────────────────────────────────────────

describe('OPEN_VOTING', () => {
  function setup() {
    const alice = new FakePeer('alice') // host
    const bob = new FakePeer('bob')
    openPeer(alice)
    openPeer(bob)

    send(alice, { type: 'JOIN', payload: { name: 'Alice' } })
    const roomCode = (alice.lastMessage()!.payload.room as { code: string }).code
    send(bob, { type: 'JOIN', payload: { name: 'Bob', code: roomCode } })
    alice.clear()
    bob.clear()

    return { alice, bob }
  }

  it('broadcasts VOTING_OPENED to all room members', () => {
    const { alice, bob } = setup()
    send(alice, { type: 'OPEN_VOTING', payload: {} })
    expect(alice.messagesOfType('VOTING_OPENED')).toHaveLength(1)
    expect(bob.messagesOfType('VOTING_OPENED')).toHaveLength(1)
  })

  it('sends ERROR to non-host who tries to open voting', () => {
    const { bob } = setup()
    send(bob, { type: 'OPEN_VOTING', payload: {} })
    expect(bob.lastMessage()?.type).toBe('ERROR')
  })

  it('sends ERROR if voting is already open', () => {
    const { alice } = setup()
    send(alice, { type: 'OPEN_VOTING', payload: {} })
    alice.clear()
    send(alice, { type: 'OPEN_VOTING', payload: {} })
    expect(alice.lastMessage()?.type).toBe('ERROR')
  })

  it('sends ERROR if votes are already revealed', () => {
    const { alice } = setup()
    send(alice, { type: 'OPEN_VOTING', payload: {} })
    send(alice, { type: 'REVEAL', payload: {} })
    alice.clear()
    send(alice, { type: 'OPEN_VOTING', payload: {} })
    expect(alice.lastMessage()?.type).toBe('ERROR')
  })
})

// ── VOTE ──────────────────────────────────────────────────────────────────────

describe('VOTE', () => {
  function setup() {
    const alice = new FakePeer('alice')
    const bob = new FakePeer('bob')
    openPeer(alice)
    openPeer(bob)

    send(alice, { type: 'JOIN', payload: { name: 'Alice' } })
    const roomCode = (alice.lastMessage()!.payload.room as { code: string }).code

    send(bob, { type: 'JOIN', payload: { name: 'Bob', code: roomCode } })
    // Open voting so players can cast votes
    send(alice, { type: 'OPEN_VOTING', payload: {} })
    alice.clear()
    bob.clear()

    return { alice, bob }
  }

  it('broadcasts VOTE_CAST to all room members', () => {
    const { alice, bob } = setup()
    send(alice, { type: 'VOTE', payload: { value: '5' } })

    expect(alice.messagesOfType('VOTE_CAST')).toHaveLength(1)
    expect(bob.messagesOfType('VOTE_CAST')).toHaveLength(1)
  })

  it('VOTE_CAST contains the voter player ID but NOT the vote value', () => {
    const { alice, bob } = setup()
    send(alice, { type: 'VOTE', payload: { value: '5' } })

    const castMsg = bob.messagesOfType('VOTE_CAST')[0]
    expect(castMsg.payload.playerId).toBe('alice')
    expect((castMsg.payload as Record<string, unknown>).value).toBeUndefined()
  })

  it('rejects a vote after reveal (votingOpen closes) and sends ERROR', () => {
    const { alice } = setup()
    send(alice, { type: 'REVEAL', payload: {} })
    alice.clear()

    send(alice, { type: 'VOTE', payload: { value: '3' } })
    expect(alice.lastMessage()?.type).toBe('ERROR')
  })

  it('rejects a vote when voting has not been opened and sends ERROR', () => {
    // Create a fresh room without opening voting
    const carol = new FakePeer('carol')
    openPeer(carol)
    send(carol, { type: 'JOIN', payload: { name: 'Carol' } })
    carol.clear()

    send(carol, { type: 'VOTE', payload: { value: '5' } })
    expect(carol.lastMessage()?.type).toBe('ERROR')
  })

  it('silently ignores VOTE if the peer has not joined a room', () => {
    const ghost = new FakePeer('ghost')
    openPeer(ghost)
    send(ghost, { type: 'VOTE', payload: { value: '5' } })
    expect(ghost.messages()).toHaveLength(0)
  })
})

// ── REVEAL ────────────────────────────────────────────────────────────────────

describe('REVEAL', () => {
  function setup() {
    const alice = new FakePeer('alice') // host
    const bob = new FakePeer('bob')
    openPeer(alice)
    openPeer(bob)

    send(alice, { type: 'JOIN', payload: { name: 'Alice' } })
    const roomCode = (alice.lastMessage()!.payload.room as { code: string }).code
    send(bob, { type: 'JOIN', payload: { name: 'Bob', code: roomCode } })
    // Open voting so players can vote before reveal
    send(alice, { type: 'OPEN_VOTING', payload: {} })
    alice.clear()
    bob.clear()

    return { alice, bob }
  }

  it('broadcasts VOTES_REVEALED with all vote values', () => {
    const { alice, bob } = setup()
    send(alice, { type: 'VOTE', payload: { value: '5' } })
    send(bob, { type: 'VOTE', payload: { value: '8' } })
    alice.clear()
    bob.clear()

    send(alice, { type: 'REVEAL', payload: {} })

    const revealMsgAlice = alice.messagesOfType('VOTES_REVEALED')[0]
    const revealMsgBob = bob.messagesOfType('VOTES_REVEALED')[0]
    expect(revealMsgAlice).toBeDefined()
    expect(revealMsgBob).toBeDefined()
    expect((revealMsgAlice.payload.votes as Record<string, string>)['alice']).toBe('5')
    expect((revealMsgAlice.payload.votes as Record<string, string>)['bob']).toBe('8')
  })

  it('sends ERROR to non-host who tries to reveal', () => {
    const { bob } = setup()
    send(bob, { type: 'REVEAL', payload: {} })
    expect(bob.lastMessage()?.type).toBe('ERROR')
  })
})

// ── NEW_ROUND ─────────────────────────────────────────────────────────────────

describe('NEW_ROUND', () => {
  function setup() {
    const alice = new FakePeer('alice') // host
    const bob = new FakePeer('bob')
    openPeer(alice)
    openPeer(bob)

    send(alice, { type: 'JOIN', payload: { name: 'Alice' } })
    const roomCode = (alice.lastMessage()!.payload.room as { code: string }).code
    send(bob, { type: 'JOIN', payload: { name: 'Bob', code: roomCode } })
    alice.clear()
    bob.clear()

    return { alice, bob }
  }

  it('broadcasts ROUND_RESET to all members', () => {
    const { alice, bob } = setup()
    send(alice, { type: 'NEW_ROUND', payload: {} })
    expect(alice.messagesOfType('ROUND_RESET')).toHaveLength(1)
    expect(bob.messagesOfType('ROUND_RESET')).toHaveLength(1)
  })

  it('clears votes so players can vote again after re-opening voting', () => {
    const { alice } = setup()
    // Open voting, cast a vote, then start a new round
    send(alice, { type: 'OPEN_VOTING', payload: {} })
    send(alice, { type: 'VOTE', payload: { value: '3' } })
    send(alice, { type: 'NEW_ROUND', payload: {} })
    alice.clear()

    // Must open voting again before votes are accepted
    send(alice, { type: 'OPEN_VOTING', payload: {} })
    alice.clear()
    send(alice, { type: 'VOTE', payload: { value: '8' } })
    expect(alice.messagesOfType('VOTE_CAST')).toHaveLength(1)
  })

  it('sends ERROR to non-host who tries to start a new round', () => {
    const { bob } = setup()
    send(bob, { type: 'NEW_ROUND', payload: {} })
    expect(bob.lastMessage()?.type).toBe('ERROR')
  })
})

// ── ASSIGN_HOST ───────────────────────────────────────────────────────────────

describe('ASSIGN_HOST', () => {
  function setup() {
    const alice = new FakePeer('alice') // host
    const bob = new FakePeer('bob')
    openPeer(alice)
    openPeer(bob)

    send(alice, { type: 'JOIN', payload: { name: 'Alice' } })
    const roomCode = (alice.lastMessage()!.payload.room as { code: string }).code
    send(bob, { type: 'JOIN', payload: { name: 'Bob', code: roomCode } })
    alice.clear()
    bob.clear()

    return { alice, bob }
  }

  it('broadcasts HOST_CHANGED when host reassigns to another player', () => {
    const { alice, bob } = setup()
    send(alice, { type: 'ASSIGN_HOST', payload: { playerId: 'bob' } })

    const aliceMsg = alice.messagesOfType('HOST_CHANGED')[0]
    const bobMsg = bob.messagesOfType('HOST_CHANGED')[0]
    expect(aliceMsg?.payload.newHostId).toBe('bob')
    expect(bobMsg?.payload.newHostId).toBe('bob')
  })

  it('sends ERROR when non-host tries to assign host', () => {
    const { bob } = setup()
    send(bob, { type: 'ASSIGN_HOST', payload: { playerId: 'alice' } })
    expect(bob.lastMessage()?.type).toBe('ERROR')
  })

  it('sends ERROR when assigning host to a non-existent player', () => {
    const { alice } = setup()
    send(alice, { type: 'ASSIGN_HOST', payload: { playerId: 'ghost' } })
    expect(alice.lastMessage()?.type).toBe('ERROR')
  })
})

// ── CHECK_IN ──────────────────────────────────────────────────────────────────

describe('CHECK_IN', () => {
  it('records the response so the player is not marked inactive', () => {
    // Pin random so the check delay is exactly CHECK_MIN_MS (60 000 ms),
    // ensuring the resolve timer cannot fire inside the first advanceTimersByTime call.
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const alice = new FakePeer('alice')
    const bob = new FakePeer('bob')
    openPeer(alice)
    openPeer(bob)

    send(alice, { type: 'JOIN', payload: { name: 'Alice' } })
    const roomCode = (alice.lastMessage()!.payload.room as { code: string }).code
    send(bob, { type: 'JOIN', payload: { name: 'Bob', code: roomCode } })
    const roomId = (bob.lastMessage()!.payload.room as { id: string }).id

    // Fire attention check (delay pinned to 60 000 ms)
    vi.advanceTimersByTime(60_001)

    // Bob checks in before the 30 s window closes
    send(bob, { type: 'CHECK_IN', payload: {} })

    // Window expires
    vi.advanceTimersByTime(30_001)

    const room = getRoomById(roomId)!
    expect(room.players.get('bob')!.isActive).toBe(true)
  })

  it('is a no-op if peer has not joined a room', () => {
    const ghost = new FakePeer('ghost')
    openPeer(ghost)
    expect(() => send(ghost, { type: 'CHECK_IN', payload: {} })).not.toThrow()
  })
})

// ── MARK_ACTIVE ───────────────────────────────────────────────────────────────

describe('MARK_ACTIVE', () => {
  it('re-activates a flagged player and broadcasts PLAYER_STATUS', () => {
    const alice = new FakePeer('alice')
    const bob = new FakePeer('bob')
    openPeer(alice)
    openPeer(bob)

    send(alice, { type: 'JOIN', payload: { name: 'Alice' } })
    const roomCode = (alice.lastMessage()!.payload.room as { code: string }).code
    send(bob, { type: 'JOIN', payload: { name: 'Bob', code: roomCode } })
    const roomId = (bob.lastMessage()!.payload.room as { id: string }).id

    // Flag bob as inactive via attention check
    vi.advanceTimersByTime(300_001)
    vi.advanceTimersByTime(30_001)
    expect(getRoomById(roomId)!.players.get('bob')!.isActive).toBe(false)

    alice.clear()
    bob.clear()

    send(bob, { type: 'MARK_ACTIVE', payload: {} })

    expect(getRoomById(roomId)!.players.get('bob')!.isActive).toBe(true)
    const aliceStatus = alice.messagesOfType('PLAYER_STATUS')[0]
    expect(aliceStatus?.payload.isActive).toBe(true)
    expect(aliceStatus?.payload.playerId).toBe('bob')
  })
})

// ── CLOSE (disconnect) ────────────────────────────────────────────────────────

describe('close (disconnect)', () => {
  it('broadcasts PLAYER_LEFT to remaining members when a non-host disconnects', () => {
    const alice = new FakePeer('alice')
    const bob = new FakePeer('bob')
    openPeer(alice)
    openPeer(bob)

    send(alice, { type: 'JOIN', payload: { name: 'Alice' } })
    const roomCode = (alice.lastMessage()!.payload.room as { code: string }).code
    send(bob, { type: 'JOIN', payload: { name: 'Bob', code: roomCode } })
    alice.clear()

    closePeer(bob)

    const leftMsg = alice.messagesOfType('PLAYER_LEFT')[0]
    expect(leftMsg?.payload.playerId).toBe('bob')
  })

  it('closes the room when the last player disconnects', () => {
    const alice = new FakePeer('alice')
    openPeer(alice)
    send(alice, { type: 'JOIN', payload: { name: 'Alice' } })
    const roomId = (alice.lastMessage()!.payload.room as { id: string }).id

    closePeer(alice)

    expect(getRoomById(roomId)).toBeUndefined()
  })

  it('auto-assigns a new host when the host disconnects', () => {
    const alice = new FakePeer('alice')
    const bob = new FakePeer('bob')
    openPeer(alice)
    openPeer(bob)

    send(alice, { type: 'JOIN', payload: { name: 'Alice' } })
    const roomCode = (alice.lastMessage()!.payload.room as { code: string }).code
    send(bob, { type: 'JOIN', payload: { name: 'Bob', code: roomCode } })
    const roomId = (bob.lastMessage()!.payload.room as { id: string }).id
    bob.clear()

    closePeer(alice)

    const room = getRoomById(roomId)!
    expect(room.hostId).toBe('bob')
    expect(room.players.get('bob')!.isHost).toBe(true)

    const hostChangedMsg = bob.messagesOfType('HOST_CHANGED')[0]
    expect(hostChangedMsg?.payload.newHostId).toBe('bob')
  })

  it('is a no-op if the peer never joined a room', () => {
    const ghost = new FakePeer('ghost')
    openPeer(ghost)
    expect(() => closePeer(ghost)).not.toThrow()
  })
})

// ── Invalid JSON ──────────────────────────────────────────────────────────────

describe('malformed messages', () => {
  it('sends ERROR when message is not valid JSON', () => {
    const alice = new FakePeer('alice')
    openPeer(alice)
    wsHooks.message(alice, { text: () => 'not json{{{' })

    expect(alice.lastMessage()?.type).toBe('ERROR')
  })
})
