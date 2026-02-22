import { useRef, useState, useEffect } from 'react'

interface MusicPlayerProps {
  votingOpen: boolean
}

export function MusicPlayer({ votingOpen }: MusicPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(0.4)
  const [notFound, setNotFound] = useState(false)

  // Autoplay when voting opens, autopause when it closes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || notFound) return

    if (votingOpen) {
      audio.volume = volume
      audio.play().then(() => setPlaying(true)).catch(() => {})
    } else {
      audio.pause()
      setPlaying(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [votingOpen])

  function toggle() {
    const audio = audioRef.current
    if (!audio) return

    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      audio.volume = volume
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseFloat(e.target.value)
    setVolume(v)
    if (audioRef.current) audioRef.current.volume = v
  }

  if (notFound) return null

  return (
    <div className={`flex items-center gap-3 rounded-lg px-4 py-2 border transition-colors ${
      playing
        ? 'bg-indigo-950 border-indigo-700'
        : 'bg-gray-900 border-gray-800'
    }`}>
      <audio
        ref={audioRef}
        src="/audio/hold-music.mp3"
        loop
        onError={() => setNotFound(true)}
      />
      <button
        type="button"
        onClick={toggle}
        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${
          playing
            ? 'bg-indigo-600 hover:bg-indigo-500'
            : 'bg-gray-700 hover:bg-gray-600'
        }`}
        title={playing ? 'Pause hold music' : 'Play hold music'}
      >
        {playing ? (
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v4a1 1 0 11-2 0V8z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </button>
      <span className={`text-xs whitespace-nowrap ${playing ? 'text-indigo-300' : 'text-gray-400'}`}>
        {playing ? 'Playing…' : 'Hold music'}
      </span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={volume}
        onChange={handleVolumeChange}
        className="w-20 accent-indigo-500"
        title="Volume"
      />
    </div>
  )
}
