import { useEffect, useState } from 'react'

interface Props {
  deadline: number
  onCheckIn: () => void
}

export function AttentionModal({ deadline, onCheckIn }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(
    Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
  )

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setSecondsLeft(remaining)
    }, 250)
    return () => clearInterval(interval)
  }, [deadline])

  const urgent = secondsLeft <= 10

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 w-full max-w-sm mx-4 text-center shadow-2xl">
        <div className="text-4xl mb-4">👋</div>
        <h2 className="text-xl font-bold text-white mb-2">Still with us?</h2>
        <p className="text-gray-400 text-sm mb-6">
          Confirm you're still in the session to stay marked as active.
        </p>

        <div
          className={`text-5xl font-mono font-bold mb-6 transition-colors ${
            urgent ? 'text-red-400' : 'text-indigo-400'
          }`}
        >
          {secondsLeft}s
        </div>

        <button
          type="button"
          onClick={onCheckIn}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors"
        >
          I'm here!
        </button>
      </div>
    </div>
  )
}
