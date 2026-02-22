/**
 * Voting utility helpers — pure functions, no browser deps, fully testable.
 */

/** Fibonacci card values used in the deck (ascending order). */
export const FIBONACCI = [1, 2, 3, 5, 8, 13, 21]

/**
 * Round a raw numeric average to the nearest Fibonacci card value.
 *
 * When the average falls exactly midway between two Fibonacci numbers the
 * higher value is chosen — i.e. the team gets the benefit of the doubt on
 * complexity.
 */
export function nearestFib(n: number): number {
  return FIBONACCI.reduce((closest, fib) =>
    Math.abs(fib - n) <= Math.abs(closest - n) ? fib : closest,
  )
}
