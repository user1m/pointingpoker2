import { describe, it, expect } from 'vitest'
import {
  NOTE_FREQS,
  MELODY,
  buildNoteSequence,
  getTotalDuration,
} from '../lib/jeopardyMusic.js'

// ── NOTE_FREQS ────────────────────────────────────────────────────────────────

describe('NOTE_FREQS', () => {
  it('contains standard reference pitches within 1 Hz of equal-temperament values', () => {
    expect(NOTE_FREQS['G4']).toBeCloseTo(392.00, 1)
    expect(NOTE_FREQS['C5']).toBeCloseTo(523.25, 1)
    expect(NOTE_FREQS['A4']).toBeCloseTo(440.00, 1)
    expect(NOTE_FREQS['D5']).toBeCloseTo(587.33, 1)
  })

  it('REST has frequency 0', () => {
    expect(NOTE_FREQS['REST']).toBe(0)
  })

  it('all non-REST frequencies are positive', () => {
    for (const [name, freq] of Object.entries(NOTE_FREQS)) {
      if (name === 'REST') continue
      expect(freq).toBeGreaterThan(0)
    }
  })

  it('higher octave notes are higher frequency than lower octave equivalents', () => {
    expect(NOTE_FREQS['C5']).toBeGreaterThan(NOTE_FREQS['G4'])
    expect(NOTE_FREQS['D5']).toBeGreaterThan(NOTE_FREQS['A4'])
    expect(NOTE_FREQS['E5']).toBeGreaterThan(NOTE_FREQS['B4'])
  })
})

// ── MELODY ────────────────────────────────────────────────────────────────────

describe('MELODY', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(MELODY)).toBe(true)
    expect(MELODY.length).toBeGreaterThan(0)
  })

  it('every entry is a [string, number] pair', () => {
    for (const entry of MELODY) {
      expect(Array.isArray(entry)).toBe(true)
      expect(entry).toHaveLength(2)
      expect(typeof entry[0]).toBe('string')
      expect(typeof entry[1]).toBe('number')
    }
  })

  it('all beat values are positive', () => {
    for (const [, beats] of MELODY) {
      expect(beats).toBeGreaterThan(0)
    }
  })

  it('every note name resolves to a known frequency', () => {
    for (const [name] of MELODY) {
      expect(NOTE_FREQS).toHaveProperty(name)
    }
  })

  it('opens with the characteristic Bb4 → Eb5 rising-fourth motif', () => {
    expect(MELODY[0][0]).toBe('Bb4')
    expect(MELODY[1][0]).toBe('Eb5')
  })

  it('contains at least one REST', () => {
    const rests = MELODY.filter(([name]) => name === 'REST')
    expect(rests.length).toBeGreaterThan(0)
  })

  it('has three distinct sections (A, B, C) — detectable by the opening note of each)', () => {
    // A section starts with Bb4, B section opens with Ab4, C section opens with G4
    const noteNames = MELODY.map(([n]) => n)
    expect(noteNames).toContain('Bb4')
    expect(noteNames).toContain('Ab4')
    expect(noteNames).toContain('G4')
  })
})

// ── buildNoteSequence ─────────────────────────────────────────────────────────

describe('buildNoteSequence', () => {
  it('returns an array with the same length as MELODY', () => {
    const notes = buildNoteSequence()
    expect(notes).toHaveLength(MELODY.length)
  })

  it('first note is Bb4 (~466 Hz)', () => {
    const notes = buildNoteSequence()
    expect(notes[0].freq).toBeCloseTo(466.16, 1)
  })

  it('second note is Eb5 (~622 Hz)', () => {
    const notes = buildNoteSequence()
    expect(notes[1].freq).toBeCloseTo(622.25, 1)
  })

  it('rest notes have frequency 0', () => {
    const notes = buildNoteSequence()
    const rests = notes.filter((n) => n.freq === 0)
    expect(rests.length).toBeGreaterThan(0)
    for (const rest of rests) {
      expect(rest.freq).toBe(0)
    }
  })

  it('all note durations are positive', () => {
    const notes = buildNoteSequence()
    for (const note of notes) {
      expect(note.duration).toBeGreaterThan(0)
    }
  })

  it('default BPM is 80 — beat duration is 0.75 s', () => {
    const notes = buildNoteSequence()
    // MELODY[0] is ['Bb4', 1 beat] → 0.75 s at 80 BPM
    expect(notes[0].duration).toBeCloseTo(0.75, 5)
  })

  it('halving BPM doubles every note duration', () => {
    const fast = buildNoteSequence(100)
    const slow = buildNoteSequence(50)
    for (let i = 0; i < fast.length; i++) {
      expect(slow[i].duration).toBeCloseTo(fast[i].duration * 2, 10)
    }
  })

  it('doubling BPM halves every note duration', () => {
    const normal = buildNoteSequence(100)
    const double = buildNoteSequence(200)
    for (let i = 0; i < normal.length; i++) {
      expect(double[i].duration).toBeCloseTo(normal[i].duration / 2, 10)
    }
  })

  it('preserves note frequency regardless of BPM', () => {
    const slow = buildNoteSequence(60)
    const fast = buildNoteSequence(180)
    for (let i = 0; i < slow.length; i++) {
      expect(slow[i].freq).toBe(fast[i].freq)
    }
  })

  it('produces at least 20 notes (long enough to be a real melody)', () => {
    expect(buildNoteSequence().length).toBeGreaterThanOrEqual(20)
  })
})

// ── getTotalDuration ──────────────────────────────────────────────────────────

describe('getTotalDuration', () => {
  it('returns the sum of all note durations at 100 BPM', () => {
    const notes = buildNoteSequence(100)
    const expected = notes.reduce((s, n) => s + n.duration, 0)
    expect(getTotalDuration(100)).toBeCloseTo(expected, 5)
  })

  it('loop is at least 20 seconds at default BPM (long enough for voting)', () => {
    expect(getTotalDuration()).toBeGreaterThanOrEqual(20)
  })

  it('duration scales inversely with BPM', () => {
    const d100 = getTotalDuration(100)
    const d200 = getTotalDuration(200)
    expect(d100).toBeCloseTo(d200 * 2, 5)
  })

  it('matches the product of total beats × beat duration', () => {
    const totalBeats = MELODY.reduce((s, [, b]) => s + b, 0)
    const bpm = 120
    const beatDuration = 60 / bpm
    expect(getTotalDuration(bpm)).toBeCloseTo(totalBeats * beatDuration, 5)
  })
})
