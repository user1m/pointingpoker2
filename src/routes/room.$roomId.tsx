import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { useEffect, useState } from 'react'
import { useRoom } from '#/hooks/useRoom'
import { CardDeck } from '#/components/CardDeck'
import { PlayerList } from '#/components/PlayerList'
import { VoteResults } from '#/components/VoteResults'
import { MusicPlayer } from '#/components/MusicPlayer'
import { AttentionModal } from '#/components/AttentionModal'
import type { CardValue } from '#/lib/types'

const searchSchema = z.object({
  name: z.string(),
  code: z.string().optional(),
})

export const Route = createFileRoute('/room/$roomId')({
  validateSearch: searchSchema,
  component: RoomPage,
})

function RoomPage() {
  const { roomId } = Route.useParams()
  const { name, code } = Route.useSearch()
  const navigate = useNavigate()
  const [selectedCard, setSelectedCard] = useState<CardValue | null>(null)
  const [copied, setCopied] = useState(false)

  const actualRoomId = roomId === 'new' ? undefined : roomId

  const { state, openVoting, vote, reveal, newRound, checkIn, markActive, assignHost } = useRoom(
    name,
    actualRoomId,
    code,
  )

  const { room, myId, connected, error, attentionCheck } = state

  // Update URL to include real roomId once we have it
  useEffect(() => {
    if (room && roomId === 'new') {
      void navigate({
        to: '/room/$roomId',
        params: { roomId: room.id },
        search: { name },
        replace: true,
      })
    }
  }, [room?.id, roomId, navigate, name])

  // Reset card selection on new round or when voting closes
  useEffect(() => {
    if (!room?.votingOpen) setSelectedCard(null)
  }, [room?.votingOpen])

  const me = room?.players.find((p) => p.id === myId)
  const isHost = me?.isHost ?? false
  const allVoted = room
    ? room.players.filter((p) => p.isActive).length > 0 &&
      room.players.filter((p) => p.isActive).every((p) => p.hasVoted)
    : false

  function handleVote(value: CardValue) {
    setSelectedCard(value)
    vote(value)
  }

  async function copyLink() {
    if (!room) return
    const url = `${window.location.origin}/room/join?code=${room.code}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!connected && !room) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400">Connecting…</div>
      </div>
    )
  }

  if (error && !room) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            type="button"
            onClick={() => void navigate({ to: '/' })}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
          >
            Back to home
          </button>
        </div>
      </div>
    )
  }

  if (!room || !myId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400">Joining room…</div>
      </div>
    )
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const { votingOpen, revealed } = room

  return (
    <>
      {attentionCheck && !isHost && (
        <AttentionModal deadline={attentionCheck.deadline} onCheckIn={checkIn} />
      )}

      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-white">Pointing Poker</h1>
              <span className="px-2 py-0.5 bg-gray-800 rounded text-xs font-mono text-gray-300 border border-gray-700">
                {room.code}
              </span>
              {/* Voting status pill */}
              {votingOpen && !revealed && (
                <span className="px-2 py-0.5 bg-green-900/60 border border-green-700 rounded-full text-xs text-green-300 animate-pulse">
                  Voting open
                </span>
              )}
              {!connected && (
                <span className="text-xs text-yellow-400">Reconnecting…</span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Music player — host only */}
              {isHost && <MusicPlayer votingOpen={votingOpen} />}
              <button
                type="button"
                onClick={() => void copyLink()}
                className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 rounded-lg transition-colors"
              >
                {copied ? 'Copied!' : 'Copy invite link'}
              </button>
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
          <div className="flex gap-6 flex-col lg:flex-row">
            {/* Left: cards + results */}
            <div className="flex-1 space-y-6">
              {/* Inactive banner */}
              {me && !me.isActive && (
                <div className="flex items-center justify-between bg-yellow-900/40 border border-yellow-700 rounded-lg px-4 py-3">
                  <span className="text-yellow-300 text-sm">
                    You were marked inactive. Click to rejoin actively.
                  </span>
                  <button
                    type="button"
                    onClick={markActive}
                    className="text-xs px-3 py-1 bg-yellow-700 hover:bg-yellow-600 text-white rounded-md"
                  >
                    I'm back
                  </button>
                </div>
              )}

              {/* Voting area */}
              {revealed ? (
                <VoteResults players={room.players} />
              ) : votingOpen ? (
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold text-white">Cast your vote</h2>
                    {allVoted && (
                      <span className="text-xs text-green-400 bg-green-900/40 border border-green-800 px-2 py-0.5 rounded-full">
                        Everyone voted
                      </span>
                    )}
                  </div>
                  <CardDeck
                    selectedValue={selectedCard}
                    revealed={false}
                    onVote={handleVote}
                  />
                </div>
              ) : (
                // Lobby — waiting for host to open voting
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-10 flex flex-col items-center justify-center gap-3 text-center">
                  {isHost ? (
                    <>
                      <p className="text-gray-400 text-sm">
                        Press <span className="text-white font-medium">Open voting</span> when you're ready to start the round.
                      </p>
                    </>
                  ) : (
                    <>
                      <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                      </svg>
                      <p className="text-gray-400 text-sm">Waiting for the host to open voting…</p>
                    </>
                  )}
                </div>
              )}

              {/* Host controls */}
              {isHost && (
                <div className="flex gap-3">
                  {revealed ? (
                    // After reveal → New round
                    <button
                      type="button"
                      onClick={newRound}
                      className="flex-1 py-2.5 bg-green-700 hover:bg-green-600 text-white font-semibold rounded-lg transition-colors"
                    >
                      New round
                    </button>
                  ) : votingOpen ? (
                    // Voting open → Reveal votes
                    <button
                      type="button"
                      onClick={reveal}
                      disabled={!room.players.some((p) => p.hasVoted)}
                      className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg transition-colors"
                    >
                      Reveal votes
                    </button>
                  ) : (
                    // Lobby → Open voting
                    <button
                      type="button"
                      onClick={openVoting}
                      className="flex-1 py-2.5 bg-green-700 hover:bg-green-600 text-white font-semibold rounded-lg transition-colors"
                    >
                      Open voting
                    </button>
                  )}
                </div>
              )}

              {error && (
                <p className="text-red-400 text-sm text-center">{error}</p>
              )}
            </div>

            {/* Right: player list */}
            <div className="w-full lg:w-64 shrink-0">
              <PlayerList
                players={room.players}
                myId={myId}
                hostId={room.hostId}
                revealed={room.revealed}
                isHost={isHost}
                onAssignHost={assignHost}
              />
            </div>
          </div>
        </main>
      </div>
    </>
  )
}
