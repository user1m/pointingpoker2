import type { PlayerDTO, CardValue } from '#/lib/types'
import { PokerCard } from './PokerCard'

const NUMERIC_VALUES: Record<string, number> = {
  '1': 1,
  '2': 2,
  '3': 3,
  '5': 5,
  '8': 8,
  '13': 13,
  '21': 21,
}

interface Props {
  players: PlayerDTO[]
}

export function VoteResults({ players }: Props) {
  const votes = players.map((p) => p.vote).filter(Boolean) as CardValue[]
  const numericVotes = votes
    .map((v) => NUMERIC_VALUES[v])
    .filter((n): n is number => n !== undefined)

  const average =
    numericVotes.length > 0
      ? (numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length).toFixed(1)
      : null

  const allSame = votes.length > 1 && new Set(votes).size === 1

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-white">Results</h2>
        <div className="flex items-center gap-4">
          {average !== null && (
            <div className="text-center">
              <div className="text-2xl font-bold text-indigo-400">{average}</div>
              <div className="text-xs text-gray-500">average</div>
            </div>
          )}
          {allSame && (
            <div className="px-3 py-1 bg-green-800 text-green-200 rounded-full text-sm font-medium">
              Consensus!
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        {players.map((player) => (
          <div key={player.id} className="flex flex-col items-center gap-2">
            {player.vote ? (
              <PokerCard value={player.vote} revealed size="md" />
            ) : (
              <div className="w-14 h-20 rounded-lg border-2 border-dashed border-gray-700 flex items-center justify-center text-gray-600 text-xs">
                —
              </div>
            )}
            <span className="text-xs text-gray-400 text-center max-w-[56px] truncate">
              {player.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
