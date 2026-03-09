import { useRef, useEffect, useCallback } from 'react'

interface MusicListenerProps {
  musicPlaying: boolean
}

export function MusicListener({ musicPlaying }: MusicListenerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pendingPlayRef = useRef(false)

  const tryPlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    const playPromise = audio.play()
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          pendingPlayRef.current = false
        })
        .catch(() => {
          // Autoplay blocked - will retry on next user interaction
          pendingPlayRef.current = true
        })
    }
  }, [])

  // Create audio element on mount
  useEffect(() => {
    const audio = new Audio('/audio/hold-music.mp3')
    audio.loop = true
    audio.volume = 0.2 // Default volume for attendees
    audioRef.current = audio

    // Try to play pending audio after user interaction
    const handleInteraction = () => {
      if (pendingPlayRef.current && audioRef.current) {
        tryPlay()
      }
    }

    document.addEventListener('click', handleInteraction, { once: true })
    document.addEventListener('touchstart', handleInteraction, { once: true })

    return () => {
      audio.pause()
      audioRef.current = null
      document.removeEventListener('click', handleInteraction)
      document.removeEventListener('touchstart', handleInteraction)
    }
  }, [tryPlay])

  // React to music state changes from host
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (musicPlaying) {
      tryPlay()
    } else {
      audio.pause()
      audio.currentTime = 0
      pendingPlayRef.current = false
    }
  }, [musicPlaying, tryPlay])

  // This component has no UI - it just plays audio
  return null
}
