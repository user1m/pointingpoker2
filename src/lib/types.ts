export type CardValue = '1' | '2' | '3' | '5' | '8' | '13' | '21' | '?' | '∞'

export interface Player {
  id: string
  name: string
  isHost: boolean
  isActive: boolean
  vote: CardValue | null
  hasVoted: boolean
}

export interface Room {
  id: string
  code: string
  players: Map<string, Player>
  votingOpen: boolean
  revealed: boolean
  hostId: string
  attentionCheckTimer: ReturnType<typeof setTimeout> | null
  activeCheck: {
    deadline: number
    respondedIds: Set<string>
    targetIds: Set<string>
  } | null
}

// DTOs sent over the wire (no Maps or Sets — plain objects/arrays)
export interface PlayerDTO {
  id: string
  name: string
  isHost: boolean
  isActive: boolean
  hasVoted: boolean
  vote?: CardValue | null
}

export interface RoomDTO {
  id: string
  code: string
  players: PlayerDTO[]
  votingOpen: boolean
  revealed: boolean
  hostId: string
  activeCheck: {
    deadline: number
  } | null
}

// ── Client → Server ──────────────────────────────────────────────────────────

export type ClientMessage =
  | { type: 'JOIN'; payload: { roomId?: string; code?: string; name: string } }
  | { type: 'OPEN_VOTING'; payload: Record<string, never> }
  | { type: 'VOTE'; payload: { value: CardValue } }
  | { type: 'REVEAL'; payload: Record<string, never> }
  | { type: 'NEW_ROUND'; payload: Record<string, never> }
  | { type: 'ASSIGN_HOST'; payload: { playerId: string } }
  | { type: 'CHECK_IN'; payload: Record<string, never> }
  | { type: 'MARK_ACTIVE'; payload: Record<string, never> }

// ── Server → Client ──────────────────────────────────────────────────────────

export type ServerMessage =
  | { type: 'ROOM_STATE'; payload: { room: RoomDTO; playerId: string } }
  | { type: 'PLAYER_JOINED'; payload: { player: PlayerDTO } }
  | { type: 'PLAYER_LEFT'; payload: { playerId: string } }
  | { type: 'VOTING_OPENED'; payload: Record<string, never> }
  | { type: 'VOTE_CAST'; payload: { playerId: string } }
  | { type: 'VOTES_REVEALED'; payload: { votes: Record<string, CardValue | null> } }
  | { type: 'ROUND_RESET'; payload: Record<string, never> }
  | { type: 'HOST_CHANGED'; payload: { newHostId: string } }
  | { type: 'ATTENTION_CHECK'; payload: { deadline: number } }
  | { type: 'PLAYER_STATUS'; payload: { playerId: string; isActive: boolean } }
  | { type: 'ERROR'; payload: { message: string } }
