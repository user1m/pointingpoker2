import { useRef, useState, useEffect } from 'react'
import { buildNoteSequence } from '#/lib/jeopardyMusic'

interface MusicPlayerProps {
  votingOpen: boolean
}

export function MusicPlayer({ votingOpen }: MusicPlayerProps) {
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(0.3)

  // All audio state lives in refs so async callbacks never close over stale values
  const ctxRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(false)
  const volumeRef = useRef(0.3)

  function getCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext()
      masterGainRef.current = ctxRef.current.createGain()
      masterGainRef.current.gain.value = volumeRef.current
      masterGainRef.current.connect(ctxRef.current.destination)
    }
    return ctxRef.current
  }

  function scheduleNote(index: number) {
    if (!activeRef.current) return
    const ctx = ctxRef.current
    const master = masterGainRef.current
    if (!ctx || !master) return

    const notes = buildNoteSequence()
    const note = notes[index % notes.length]
    const now = ctx.currentTime

    if (note.freq > 0) {
      const osc = ctx.createOscillator()
      const env = ctx.createGain()
      osc.type = 'triangle' // warmer than sine, less buzzy than square
      osc.frequency.value = note.freq
      osc.connect(env)
      env.connect(master)

      // Smooth attack/release envelope to avoid audible clicks
      const attack = Math.min(0.03, note.duration * 0.1)
      const release = Math.min(0.06, note.duration * 0.2)
      env.gain.setValueAtTime(0, now)
      env.gain.linearRampToValueAtTime(1, now + attack)
      env.gain.setValueAtTime(1, now + note.duration - release)
      env.gain.linearRampToValueAtTime(0, now + note.duration)

      osc.start(now)
      osc.stop(now + note.duration)
    }

    timerRef.current = setTimeout(
      () => scheduleNote((index + 1) % notes.length),
      note.duration * 1000,
    )
  }

  function startPlayback() {
    const ctx = getCtx()
    if (!ctx) return
    if (ctx.state === 'suspended') void ctx.resume()

    // Cancel any in-flight gain fade from a previous stop and restore volume
    const master = masterGainRef.current
    if (master) {
      master.gain.cancelScheduledValues(ctx.currentTime)
      master.gain.value = volumeRef.current
    }

    activeRef.current = true
    scheduleNote(0)
    setPlaying(true)
  }

  function stopPlayback() {
    activeRef.current = false
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    // Short fade-out to avoid a hard click on the current note
    const ctx = ctxRef.current
    const master = masterGainRef.current
    if (ctx && master) {
      const now = ctx.currentTime
      master.gain.setValueAtTime(master.gain.value, now)
      master.gain.linearRampToValueAtTime(0, now + 0.08)
      // Restore gain value after the fade so the next startPlayback sounds full
      setTimeout(() => {
        if (!activeRef.current && master) master.gain.value = volumeRef.current
      }, 120)
    }
    setPlaying(false)
  }

  // Autoplay when voting opens, autopause when it closes
  useEffect(() => {
    if (votingOpen) {
      startPlayback()
    } else {
      stopPlayback()
    }
    return () => {
      activeRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [votingOpen])

  // Full cleanup on unmount
  useEffect(() => {
    return () => {
      activeRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      ctxRef.current?.close()
    }
  }, [])

  function toggle() {
    if (playing) stopPlayback()
    else startPlayback()
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseFloat(e.target.value)
    setVolume(v)
    volumeRef.current = v
    // Apply live while playing
    if (masterGainRef.current && activeRef.current) {
      masterGainRef.current.gain.value = v
    }
  }

  return (
    <div className={`flex items-center gap-3 rounded-lg px-4 py-2 border transition-colors ${
      playing ? 'bg-indigo-950 border-indigo-700' : 'bg-gray-900 border-gray-800'
    }`}>
      <button
        type="button"
        onClick={toggle}
        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${
          playing ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-gray-700 hover:bg-gray-600'
        }`}
        title={playing ? 'Pause hold music' : 'Play hold music'}
      >
        {playing ? (
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v4a1 1 0 11-2 0V8z"
              clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
              clipRule="evenodd" />
          </svg>
        )}
      </button>

      <span className={`text-xs whitespace-nowrap ${playing ? 'text-indigo-300' : 'text-gray-400'}`}>
        {playing ? 'Playing…' : 'Think! music'}
      </span>

      {/* Volume */}
      <div className="flex items-center gap-1.5">
        <svg className="w-3 h-3 text-gray-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd"
            d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.617.784L4.93 14H3a1 1 0 01-1-1V7a1 1 0 011-1h1.93l3.453-2.784a1 1 0 011 .076zM12.293 7.293a1 1 0 011.414 0A5.98 5.98 0 0115 11a5.98 5.98 0 01-1.293 3.707 1 1 0 01-1.414-1.414A3.987 3.987 0 0013 11a3.987 3.987 0 00-.707-2.293 1 1 0 010-1.414z"
            clipRule="evenodd" />
        </svg>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={handleVolumeChange}
          className="w-20 accent-indigo-500"
          title={`Volume: ${Math.round(volume * 100)}%`}
        />
      </div>
    </div>
  )
}
