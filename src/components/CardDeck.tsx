import type { CardValue } from '#/lib/types'
import { PokerCard } from './PokerCard'

const CARD_VALUES: CardValue[] = ['1', '2', '3', '5', '8', '13', '21', '?', '∞']

interface Props {
  selectedValue: CardValue | null
  revealed: boolean
  onVote: (value: CardValue) => void
}

export function CardDeck({ selectedValue, revealed, onVote }: Props) {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {CARD_VALUES.map((value) => (
        <PokerCard
          key={value}
          value={value}
          selected={selectedValue === value}
          disabled={revealed}
          onClick={() => !revealed && onVote(value)}
          size="lg"
        />
      ))}
    </div>
  )
}
