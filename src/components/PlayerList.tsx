import type { PlayerDTO } from '#/lib/types'

interface Props {
  players: PlayerDTO[]
  myId: string
  hostId: string
  revealed: boolean
  isHost: boolean
  onAssignHost: (playerId: string) => void
}

export function PlayerList({ players, myId, hostId, revealed, isHost, onAssignHost }: Props) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Players ({players.length})
      </h2>
      <ul className="space-y-2">
        {players.map((player) => (
          <li
            key={player.id}
            className="flex items-center gap-2 py-2 px-3 rounded-lg bg-gray-800"
          >
            {/* Active dot */}
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                player.isActive ? 'bg-green-400' : 'bg-yellow-400'
              }`}
              title={player.isActive ? 'Active' : 'Inactive'}
            />

            {/* Host crown */}
            {player.id === hostId && (
              <span className="text-yellow-400 text-xs shrink-0" title="Host">
                👑
              </span>
            )}

            {/* Name */}
            <span
              className={`flex-1 text-sm font-medium truncate ${
                player.id === myId ? 'text-indigo-300' : 'text-gray-200'
              }`}
            >
              {player.name}
              {player.id === myId && (
                <span className="text-gray-500 ml-1 font-normal">(you)</span>
              )}
            </span>

            {/* Vote status */}
            <span className="shrink-0">
              {revealed ? (
                <span
                  className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${
                    player.vote ? 'bg-indigo-800 text-indigo-200' : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {player.vote ?? '—'}
                </span>
              ) : player.hasVoted ? (
                <span
                  className="w-5 h-5 rounded bg-green-700 flex items-center justify-center text-xs text-white"
                  title="Voted"
                >
                  ✓
                </span>
              ) : (
                <span className="w-5 h-5 rounded border border-gray-600 flex items-center justify-center text-xs text-gray-600">
                  …
                </span>
              )}
            </span>

            {/* Assign host button */}
            {isHost && player.id !== myId && player.id !== hostId && (
              <button
                type="button"
                onClick={() => onAssignHost(player.id)}
                className="text-gray-500 hover:text-yellow-400 text-xs ml-1 transition-colors shrink-0"
                title="Make host"
              >
                👑
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
