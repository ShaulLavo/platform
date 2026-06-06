import { describe, expect, it } from 'vitest'

// Proves the `node` project boots: vitest runner + @/ alias resolution.
describe('vitest node world', () => {
  it('runs a pure-logic test', () => {
    expect([1, 2, 3].reduce((sum, n) => sum + n, 0)).toBe(6)
  })
})
