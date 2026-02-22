import { useEffect, useRef, useState, useCallback } from 'react'
import type { RoomDTO, CardValue, ServerMessage, ClientMessage } from '#/lib/types'

export interface RoomState {
  room: RoomDTO | null
  myId: string | null
  connected: boolean
  error: string | null
  attentionCheck: { deadline: number } | null
}

export function useRoom(name: string, roomId?: string, code?: string) {
  const [state, setState] = useState<RoomState>({
    room: null,
    myId: null,
    connected: false,
    error: null,
    attentionCheck: null,
  })

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  const connect = useCallback(() => {
    if (!name) return

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${window.location.host}/api/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      setState((s) => ({ ...s, connected: true, error: null }))
      ws.send(
        JSON.stringify({
          type: 'JOIN',
          payload: { name, roomId, code },
        } satisfies ClientMessage),
      )
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string) as ServerMessage

      setState((prev) => {
        switch (msg.type) {
          case 'ROOM_STATE': {
            return {
              ...prev,
              room: msg.payload.room,
              myId: msg.payload.playerId,
              attentionCheck: msg.payload.room.activeCheck,
            }
          }

          case 'PLAYER_JOINED': {
            if (!prev.room) return prev
            const exists = prev.room.players.find((p) => p.id === msg.payload.player.id)
            if (exists) return prev
            return {
              ...prev,
              room: {
                ...prev.room,
                players: [...prev.room.players, msg.payload.player],
              },
            }
          }

          case 'PLAYER_LEFT': {
            if (!prev.room) return prev
            return {
              ...prev,
              room: {
                ...prev.room,
                players: prev.room.players.filter((p) => p.id !== msg.payload.playerId),
              },
            }
          }

          case 'VOTING_OPENED': {
            if (!prev.room) return prev
            return {
              ...prev,
              room: { ...prev.room, votingOpen: true },
            }
          }

          case 'VOTE_CAST': {
            if (!prev.room) return prev
            return {
              ...prev,
              room: {
                ...prev.room,
                players: prev.room.players.map((p) =>
                  p.id === msg.payload.playerId ? { ...p, hasVoted: true } : p,
                ),
              },
            }
          }

          case 'VOTES_REVEALED': {
            if (!prev.room) return prev
            return {
              ...prev,
              room: {
                ...prev.room,
                votingOpen: false,
                revealed: true,
                players: prev.room.players.map((p) => ({
                  ...p,
                  vote: msg.payload.votes[p.id] ?? null,
                })),
              },
            }
          }

          case 'ROUND_RESET': {
            if (!prev.room) return prev
            return {
              ...prev,
              room: {
                ...prev.room,
                votingOpen: false,
                revealed: false,
                players: prev.room.players.map((p) => ({
                  ...p,
                  vote: undefined,
                  hasVoted: false,
                })),
              },
            }
          }

          case 'HOST_CHANGED': {
            if (!prev.room) return prev
            return {
              ...prev,
              room: {
                ...prev.room,
                hostId: msg.payload.newHostId,
                players: prev.room.players.map((p) => ({
                  ...p,
                  isHost: p.id === msg.payload.newHostId,
                })),
              },
            }
          }

          case 'ATTENTION_CHECK': {
            return {
              ...prev,
              attentionCheck: { deadline: msg.payload.deadline },
            }
          }

          case 'PLAYER_STATUS': {
            if (!prev.room) return prev
            return {
              ...prev,
              room: {
                ...prev.room,
                players: prev.room.players.map((p) =>
                  p.id === msg.payload.playerId
                    ? { ...p, isActive: msg.payload.isActive }
                    : p,
                ),
              },
            }
          }

          case 'ERROR': {
            return { ...prev, error: msg.payload.message }
          }

          default:
            return prev
        }
      })
    }

    ws.onerror = () => {
      setState((s) => ({ ...s, error: 'Connection error' }))
    }

    ws.onclose = () => {
      setState((s) => ({ ...s, connected: false }))
      reconnectTimer.current = setTimeout(connect, 3000)
    }
  }, [name, roomId, code])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  const openVoting = useCallback(
    () => send({ type: 'OPEN_VOTING', payload: {} }),
    [send],
  )

  const vote = useCallback(
    (value: CardValue) => send({ type: 'VOTE', payload: { value } }),
    [send],
  )

  const reveal = useCallback(
    () => send({ type: 'REVEAL', payload: {} }),
    [send],
  )

  const newRound = useCallback(
    () => send({ type: 'NEW_ROUND', payload: {} }),
    [send],
  )

  const checkIn = useCallback(() => {
    send({ type: 'CHECK_IN', payload: {} })
    setState((s) => ({ ...s, attentionCheck: null }))
  }, [send])

  const markActive = useCallback(
    () => send({ type: 'MARK_ACTIVE', payload: {} }),
    [send],
  )

  const assignHost = useCallback(
    (playerId: string) => send({ type: 'ASSIGN_HOST', payload: { playerId } }),
    [send],
  )

  return { state, openVoting, vote, reveal, newRound, checkIn, markActive, assignHost }
}
