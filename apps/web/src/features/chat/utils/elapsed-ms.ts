/** Milliseconds since a `performance.now()` mark, rounded to two decimals. */
export function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100
}
