/**
 * Shared WebSocket hooks — used by both the Nitro production route handler
 * (server/routes/api/ws.ts) and the Vite dev-mode plugin (vite.config.ts).
 */
import {
  createRoom,
  getRoomById,
  getRoomByCode,
  addPlayerToRoom,
  removePlayerFromRoom,
  castVote,
  revealVotes,
  resetRound,
  assignHost,
  handleCheckIn,
  handleMarkActive,
  registerPeer,
  unregisterPeer,
  broadcastToRoom,
  sendTo,
  toRoomDTO,
  toPlayerDTO,
  scheduleAttentionCheck,
} from './roomStore.js'
import type { ClientMessage, Player } from '../src/lib/types.js'

// Track which room each peer belongs to
const peerRooms = new Map<string, string>()

/** Reset module-level state. Only call from tests. */
export function _resetForTesting() {
  peerRooms.clear()
}

interface Peer {
  id: string
  send: (data: string) => void
}

interface Message {
  text(): string
}

export const wsHooks = {
  open(peer: Peer) {
    registerPeer(peer.id, { send: (data: string) => peer.send(data) })
  },

  message(peer: Peer, raw: Message) {
    let msg: ClientMessage
    try {
      msg = JSON.parse(raw.text()) as ClientMessage
    } catch {
      sendTo(peer.id, { type: 'ERROR', payload: { message: 'Invalid JSON' } })
      return
    }

    const playerId = peer.id

    switch (msg.type) {
      case 'JOIN': {
        const { name, roomId, code } = msg.payload

        if (!name || name.trim().length === 0) {
          sendTo(playerId, { type: 'ERROR', payload: { message: 'Name is required' } })
          return
        }

        let room = roomId
          ? getRoomById(roomId)
          : code
            ? getRoomByCode(code.toUpperCase())
            : undefined

        if (!room) {
          room = createRoom(playerId, name.trim())
          peerRooms.set(playerId, room.id)
          sendTo(playerId, {
            type: 'ROOM_STATE',
            payload: { room: toRoomDTO(room), playerId },
          })
          return
        }

        const player: Player = {
          id: playerId,
          name: name.trim(),
          isHost: false,
          isActive: true,
          vote: null,
          hasVoted: false,
        }

        addPlayerToRoom(room, player)
        peerRooms.set(playerId, room.id)

        sendTo(playerId, {
          type: 'ROOM_STATE',
          payload: { room: toRoomDTO(room), playerId },
        })

        broadcastToRoom(room.id, {
          type: 'PLAYER_JOINED',
          payload: { player: toPlayerDTO(player, room.revealed) },
        }, playerId)

        break
      }

      case 'VOTE': {
        const roomId = peerRooms.get(playerId)
        if (!roomId) return
        const room = getRoomById(roomId)
        if (!room) return

        if (!castVote(room, playerId, msg.payload.value)) {
          sendTo(playerId, { type: 'ERROR', payload: { message: 'Cannot vote right now' } })
          return
        }

        broadcastToRoom(roomId, { type: 'VOTE_CAST', payload: { playerId } })
        break
      }

      case 'REVEAL': {
        const roomId = peerRooms.get(playerId)
        if (!roomId) return
        const room = getRoomById(roomId)
        if (!room) return

        if (room.hostId !== playerId) {
          sendTo(playerId, { type: 'ERROR', payload: { message: 'Only the host can reveal votes' } })
          return
        }

        const votes = revealVotes(room)
        broadcastToRoom(roomId, { type: 'VOTES_REVEALED', payload: { votes } })
        break
      }

      case 'NEW_ROUND': {
        const roomId = peerRooms.get(playerId)
        if (!roomId) return
        const room = getRoomById(roomId)
        if (!room) return

        if (room.hostId !== playerId) {
          sendTo(playerId, { type: 'ERROR', payload: { message: 'Only the host can start a new round' } })
          return
        }

        resetRound(room)
        broadcastToRoom(roomId, { type: 'ROUND_RESET', payload: {} })
        scheduleAttentionCheck(roomId)
        break
      }

      case 'ASSIGN_HOST': {
        const roomId = peerRooms.get(playerId)
        if (!roomId) return
        const room = getRoomById(roomId)
        if (!room) return

        if (!assignHost(room, playerId, msg.payload.playerId)) {
          sendTo(playerId, { type: 'ERROR', payload: { message: 'Cannot assign host' } })
          return
        }

        broadcastToRoom(roomId, {
          type: 'HOST_CHANGED',
          payload: { newHostId: msg.payload.playerId },
        })
        break
      }

      case 'CHECK_IN': {
        const roomId = peerRooms.get(playerId)
        if (!roomId) return
        const room = getRoomById(roomId)
        if (!room) return
        handleCheckIn(room, playerId)
        break
      }

      case 'MARK_ACTIVE': {
        const roomId = peerRooms.get(playerId)
        if (!roomId) return
        const room = getRoomById(roomId)
        if (!room) return
        handleMarkActive(room, playerId)
        break
      }
    }
  },

  close(peer: Peer) {
    const playerId = peer.id
    const roomId = peerRooms.get(playerId)

    unregisterPeer(playerId)
    peerRooms.delete(playerId)

    if (!roomId) return

    const { roomClosed } = removePlayerFromRoom(roomId, playerId)
    if (!roomClosed) {
      broadcastToRoom(roomId, { type: 'PLAYER_LEFT', payload: { playerId } })
    }
  },
}
