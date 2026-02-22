import { describe, it, expect } from 'vitest'
import { nearestFib, FIBONACCI } from '../lib/votingUtils.js'

describe('nearestFib', () => {
  it('returns the exact value when input is already a Fibonacci card', () => {
    for (const fib of FIBONACCI) {
      expect(nearestFib(fib)).toBe(fib)
    }
  })

  it('rounds down when clearly closer to the lower Fibonacci', () => {
    expect(nearestFib(1.2)).toBe(1)   // |1-1.2|=0.2 vs |2-1.2|=0.8
    expect(nearestFib(3.9)).toBe(3)   // |3-3.9|=0.9 vs |5-3.9|=1.1 — wait, these are NOT equal
    expect(nearestFib(6)).toBe(5)     // |5-6|=1     vs |8-6|=2
    expect(nearestFib(10)).toBe(8)    // |8-10|=2    vs |13-10|=3
  })

  it('rounds up when clearly closer to the higher Fibonacci', () => {
    expect(nearestFib(1.8)).toBe(2)   // |2-1.8|=0.2 vs |1-1.8|=0.8
    expect(nearestFib(4.5)).toBe(5)   // |5-4.5|=0.5 vs |3-4.5|=1.5
    expect(nearestFib(7)).toBe(8)     // |8-7|=1     vs |5-7|=2
    expect(nearestFib(11)).toBe(13)   // |13-11|=2   vs |8-11|=3
  })

  it('rounds up (higher) when equidistant between two Fibonacci numbers', () => {
    expect(nearestFib(1.5)).toBe(2)   // midpoint of 1 and 2
    expect(nearestFib(4)).toBe(5)     // midpoint of 3 and 5
    expect(nearestFib(6.5)).toBe(8)   // midpoint of 5 and 8
    expect(nearestFib(17)).toBe(21)   // midpoint of 13 and 21
  })

  it('clamps to 1 for values at or below the minimum', () => {
    expect(nearestFib(0)).toBe(1)
    expect(nearestFib(0.5)).toBe(1)
    expect(nearestFib(-5)).toBe(1)
  })

  it('clamps to 21 for values above the maximum', () => {
    expect(nearestFib(22)).toBe(21)
    expect(nearestFib(100)).toBe(21)
  })
})
