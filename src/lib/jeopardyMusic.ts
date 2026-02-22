/**
 * Jeopardy "Think!" theme synthesizer data.
 *
 * All frequency/timing logic lives here as pure data so it can be unit-tested
 * in Node.js without any browser APIs.  The MusicPlayer component consumes
 * this to drive the Web Audio oscillator engine.
 */

// ── Note frequencies (Hz, equal temperament, A4 = 440) ───────────────────────

export const NOTE_FREQS: Record<string, number> = {
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  Gb4: 369.99,
  G4: 392.00,
  Ab4: 415.30,
  A4: 440.00,
  Bb4: 466.16,
  B4: 493.88,
  C5: 523.25,
  Db5: 554.37,
  D5: 587.33,
  Eb5: 622.25,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
  REST: 0,
}

/**
 * The melody as [noteName, beats] pairs.
 *
 * Jeopardy "Final Jeopardy / Think!" theme in Bb major (authentic TV key).
 * At the default 80 BPM the loop is ~51 seconds.
 *
 * Structure:
 *   A section — Bb-major feel, the famous opening motif (×2)
 *   B section — Ab-major feel, the contrasting phrase (×2)
 *   C section — G feel, the climactic phrase (×2) + rest
 */
export const MELODY: [string, number][] = [
  // ── A section ──────────────────────────────────────────────────────────────
  ['Bb4', 1], ['Eb5', 1], ['Bb4', 1], ['G4', 2],
  ['C5', 1], ['REST', 0.5], ['C5', 0.5], ['F5', 3], ['REST', 1],

  ['Bb4', 1], ['Eb5', 1], ['Bb4', 1], ['G4', 2],
  ['Bb4', 5], ['REST', 1],

  // ── B section ──────────────────────────────────────────────────────────────
  ['Ab4', 1], ['Db5', 1], ['Ab4', 1], ['F4', 2],
  ['Bb4', 1], ['REST', 0.5], ['Bb4', 0.5], ['Eb5', 3], ['REST', 1],

  ['Ab4', 1], ['Db5', 1], ['Ab4', 1], ['F4', 2],
  ['Ab4', 5], ['REST', 1],

  // ── C section ──────────────────────────────────────────────────────────────
  ['G4', 1], ['C5', 1], ['G4', 1], ['A4', 2],
  ['D5', 1], ['REST', 0.5], ['D5', 0.5], ['G5', 3], ['REST', 1],

  ['G4', 1], ['C5', 1], ['G4', 1], ['A4', 2],
  ['G4', 5], ['REST', 3],
]

// ── Exports ───────────────────────────────────────────────────────────────────

export interface MusicalNote {
  /** Frequency in Hz. 0 means a rest (silence). */
  freq: number
  /** Duration in seconds. */
  duration: number
}

/**
 * Convert the raw MELODY data into concrete MusicalNote objects at a given BPM.
 *
 * @param bpm Beats per minute. Defaults to 80.
 */
export function buildNoteSequence(bpm = 80): MusicalNote[] {
  const beatDuration = 60 / bpm
  return MELODY.map(([name, beats]) => ({
    freq: NOTE_FREQS[name] ?? 0,
    duration: beats * beatDuration,
  }))
}

/** Total loop duration in seconds at the given BPM. */
export function getTotalDuration(bpm = 80): number {
  return buildNoteSequence(bpm).reduce((sum, n) => sum + n.duration, 0)
}
