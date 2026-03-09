import { useRef, useEffect } from 'react'
import { buildNoteSequence } from '#/lib/jeopardyMusic'

interface MusicListenerProps {
  musicPlaying: boolean
}

export function MusicListener({ musicPlaying }: MusicListenerProps) {
  // ── Synth audio state ────────────────────────────────────────────────────────
  const ctxRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(false)

  function getCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext()
      masterGainRef.current = ctxRef.current.createGain()
      masterGainRef.current.gain.value = 0.2 // Default volume for attendees
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

      const attack = 0.005
      const decayEnd = Math.max(attack + 0.01, note.duration * 0.9)
      env.gain.setValueAtTime(0, now)
      env.gain.linearRampToValueAtTime(1, now + attack)
      env.gain.exponentialRampToValueAtTime(0.001, now + decayEnd)
      env.gain.setValueAtTime(0, now + note.duration)

      osc.start(now)
      osc.stop(now + note.duration)

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

  function startPlayback() {
    const ctx = getCtx()
    if (!ctx) return
    if (ctx.state === 'suspended') void ctx.resume()

    const master = masterGainRef.current
    if (master) {
      master.gain.cancelScheduledValues(ctx.currentTime)
      master.gain.value = 0.2
    }

    activeRef.current = true
    scheduleNote(0)
  }

  function stopPlayback() {
    activeRef.current = false
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const ctx = ctxRef.current
    const master = masterGainRef.current
    if (ctx && master) {
      const now = ctx.currentTime
      master.gain.setValueAtTime(master.gain.value, now)
      master.gain.linearRampToValueAtTime(0, now + 0.08)
      setTimeout(() => {
        if (!activeRef.current && master) master.gain.value = 0.2
      }, 120)
    }
  }

  // React to music state changes from host
  useEffect(() => {
    if (musicPlaying) {
      startPlayback()
    } else {
      stopPlayback()
    }
    return () => {
      activeRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [musicPlaying])

  // Full cleanup on unmount
  useEffect(() => {
    return () => {
      activeRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      ctxRef.current?.close()
    }
  }, [])

  // This component has no UI - it just plays audio
  return null
}
