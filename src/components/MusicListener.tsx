import { useRef, useEffect } from 'react'

interface MusicListenerProps {
  musicPlaying: boolean
}

export function MusicListener({ musicPlaying }: MusicListenerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Create audio element on mount
  useEffect(() => {
    const audio = new Audio('/audio/hold-music.mp3')
    audio.loop = true
    audio.volume = 0.2 // Default volume for attendees
    audioRef.current = audio

    return () => {
      audio.pause()
      audioRef.current = null
    }
  }, [])

  // React to music state changes from host
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (musicPlaying) {
      // Try to play, handle autoplay restrictions
      const playPromise = audio.play()
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Autoplay blocked - user needs to interact with page first
          // This is expected behavior in modern browsers
        })
      }
    } else {
      audio.pause()
      audio.currentTime = 0
    }
  }, [musicPlaying])

  // This component has no UI - it just plays audio
  return null
}
