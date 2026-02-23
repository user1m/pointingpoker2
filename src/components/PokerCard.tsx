import type { CardValue } from '#/lib/types'

interface Props {
  value: CardValue
  selected?: boolean
  revealed?: boolean
  disabled?: boolean
  onClick?: () => void
  size?: 'sm' | 'md' | 'lg'
}

export function PokerCard({ value, selected, revealed, disabled, onClick, size = 'md' }: Props) {
  const sizeClasses = {
    sm: 'w-9 h-12 text-xs sm:w-10 sm:h-14 sm:text-sm',
    md: 'w-11 h-16 text-sm sm:w-14 sm:h-20 sm:text-base',
    lg: 'w-12 h-16 text-base sm:w-16 sm:h-24 sm:text-lg',
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        sizeClasses[size],
        'rounded-lg border-2 font-bold transition-all duration-150 select-none',
        'flex items-center justify-center',
        selected
          ? 'border-indigo-400 bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 -translate-y-2'
          : revealed
            ? 'border-gray-600 bg-gray-800 text-white cursor-default'
            : disabled
              ? 'border-gray-700 bg-gray-900 text-gray-600 cursor-not-allowed'
              : 'border-gray-600 bg-gray-800 text-gray-200 hover:border-indigo-400 hover:bg-gray-700 hover:text-white cursor-pointer hover:-translate-y-1',
      ].join(' ')}
    >
      {value}
    </button>
  )
}
