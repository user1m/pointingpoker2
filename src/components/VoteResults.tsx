import type { PlayerDTO, CardValue } from '#/lib/types'
import { nearestFib } from '#/lib/votingUtils'
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

  const rawAverage =
    numericVotes.length > 0
      ? numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length
      : null

  const suggestion = rawAverage !== null ? nearestFib(rawAverage) : null

  const allSame = votes.length > 1 && new Set(votes).size === 1

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <h2 className="text-lg font-semibold text-white">Results</h2>
        <div className="flex items-center gap-3 flex-wrap">
          {rawAverage !== null && (
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="text-center">
                <div className="text-lg sm:text-xl font-medium text-indigo-400">
                  {rawAverage.toFixed(1)}
                </div>
                <div className="text-xs text-gray-500">avg</div>
              </div>
              <div className="text-gray-600">→</div>
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-white">{suggestion}</div>
                <div className="text-xs text-gray-500">suggested</div>
              </div>
            </div>
          )}
          {allSame && (
            <div className="px-3 py-1 bg-green-800 text-green-200 rounded-full text-sm font-medium">
              Consensus!
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 sm:gap-4">
        {players.map((player) => (
          <div key={player.id} className="flex flex-col items-center gap-2">
            {player.vote ? (
              <PokerCard value={player.vote} revealed size="md" />
            ) : (
              <div className="w-11 h-16 sm:w-14 sm:h-20 rounded-lg border-2 border-dashed border-gray-700 flex items-center justify-center text-gray-600 text-xs">
                —
              </div>
            )}
            <span className="text-xs text-gray-400 text-center max-w-[44px] sm:max-w-[56px] truncate">
              {player.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
