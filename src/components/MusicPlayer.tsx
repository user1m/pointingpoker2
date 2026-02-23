import { useRef, useState, useEffect } from 'react'
import { buildNoteSequence } from '#/lib/jeopardyMusic'

interface MusicPlayerProps {
  votingOpen: boolean
}

type AudioSource = 'detecting' | 'file' | 'synth'

export function MusicPlayer({ votingOpen }: MusicPlayerProps) {
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(0.3)

  // Mirror audioSource in a ref so async callbacks never close over stale state
  const [audioSource, _setAudioSource] = useState<AudioSource>('detecting')
  const audioSourceRef = useRef<AudioSource>('detecting')
  function setAudioSource(s: AudioSource) {
    audioSourceRef.current = s
    _setAudioSource(s)
  }

  // ── File-based audio ────────────────────────────────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // ── Synth audio state ───────────────────────────────────────────────────────
  const ctxRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(false)
  const volumeRef = useRef(0.3)

  // Probe whether the hold-music file is present; choose source accordingly
  useEffect(() => {
    fetch('/audio/hold-music.mp3', { method: 'HEAD' })
      .then(r => setAudioSource(r.ok ? 'file' : 'synth'))
      .catch(() => setAudioSource('synth'))
  }, [])

  // Create the HTMLAudioElement once we know the file is available
  // NOTE: defined before the votingOpen effect so React runs it first when
  // audioSource changes, ensuring audioRef.current is populated before playback starts.
  useEffect(() => {
    if (audioSource !== 'file') return
    const audio = new Audio('/audio/hold-music.mp3')
    audio.loop = true
    audio.volume = volumeRef.current
    // If the file turns out to be unplayable (wrong format, corrupt, etc.) fall back to synth
    audio.addEventListener('error', () => setAudioSource('synth'), { once: true })
    audioRef.current = audio
    return () => {
      audio.pause()
      audioRef.current = null
    }
  }, [audioSource])

  // ── Synth helpers ────────────────────────────────────────────────────────────

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
      osc.type = 'sine'
      osc.frequency.value = note.freq
      osc.connect(env)
      env.connect(master)

      // Mallet-style envelope: instant strike, exponential decay (vibraphone feel)
      const attack = 0.005
      const decayEnd = Math.max(attack + 0.01, note.duration * 0.9)
      env.gain.setValueAtTime(0, now)
      env.gain.linearRampToValueAtTime(1, now + attack)
      env.gain.exponentialRampToValueAtTime(0.001, now + decayEnd)
      env.gain.setValueAtTime(0, now + note.duration)

      osc.start(now)
      osc.stop(now + note.duration)

      // 4th harmonic adds metallic warmth (overtone typical of mallet instruments)
      const harm = ctx.createOscillator()
      const harmGain = ctx.createGain()
      harm.type = 'sine'
      harm.frequency.value = note.freq * 4
      harm.connect(harmGain)
      harmGain.connect(master)
      harmGain.gain.setValueAtTime(0, now)
      harmGain.gain.linearRampToValueAtTime(0.12, now + attack)
      harmGain.gain.exponentialRampToValueAtTime(0.001, now + Math.max(attack + 0.01, decayEnd * 0.4))
      harmGain.gain.setValueAtTime(0, now + note.duration)
      harm.start(now)
      harm.stop(now + note.duration)
    }

    timerRef.current = setTimeout(
      () => scheduleNote((index + 1) % notes.length),
      note.duration * 1000,
    )
  }

  // ── Playback control (shared interface for both sources) ─────────────────────

  function startPlayback() {
    if (audioSourceRef.current === 'file') {
      const audio = audioRef.current
      if (!audio) return
      void audio.play()
      setPlaying(true)
      return
    }

    // Synth path (also used when still 'detecting' so there's no dead silence)
    const ctx = getCtx()
    if (!ctx) return
    if (ctx.state === 'suspended') void ctx.resume()

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
    if (audioSourceRef.current === 'file') {
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        audio.currentTime = 0
      }
      setPlaying(false)
      return
    }

    // Synth path
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
      setTimeout(() => {
        if (!activeRef.current && master) master.gain.value = volumeRef.current
      }, 120)
    }
    setPlaying(false)
  }

  // Autoplay when voting opens; wait until source is resolved before starting
  useEffect(() => {
    if (audioSource === 'detecting') return
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
  }, [votingOpen, audioSource])

  // Full cleanup on unmount
  useEffect(() => {
    return () => {
      activeRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      ctxRef.current?.close()
      audioRef.current?.pause()
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
    if (audioSourceRef.current === 'file') {
      if (audioRef.current) audioRef.current.volume = v
    } else {
      if (masterGainRef.current && activeRef.current) {
        masterGainRef.current.gain.value = v
      }
    }
  }

  return (
    <div className={`flex items-center gap-2 sm:gap-3 rounded-lg px-2 sm:px-4 py-2 border transition-colors ${
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

      {/* Text label — hidden on small screens to save header space */}
      <span className={`hidden sm:block text-xs whitespace-nowrap ${playing ? 'text-indigo-300' : 'text-gray-400'}`}>
        {playing ? 'Playing…' : 'Think! music'}
      </span>

      {/* Volume */}
      <div className="flex items-center gap-1">
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
          className="w-16 sm:w-20 accent-indigo-500"
          title={`Volume: ${Math.round(volume * 100)}%`}
        />
      </div>
    </div>
  )
}
