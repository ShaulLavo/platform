import { describe } from 'vitest'

import { expect, test } from '../../../../test/fixtures'

import { diffScopeFor, diffScopeParam } from '@/features/address/utils/diff-scope'
import type { TurnId } from '@workspace/contracts'

/**
 * `?diff=` is the one slot whose value the app does not mint: a turn id arrives from the
 * provider as `event.turnId`. `TurnId` is `opaqueIdSchema('TurnId')` — any non-empty
 * string — so the decoder cannot demand a shape, and the one it used to demand (`turn-`)
 * held only in this repo's own test fixtures.
 */
describe('the thread diff scope', () => {
  test('round-trips the working tree', () => {
    expect(diffScopeParam({ kind: 'working-tree' })).toBe('wt')
    expect(diffScopeFor('wt')).toEqual({ kind: 'working-tree' })
  })

  // The regression: the encoder emitted these and its own decoder threw them away, so a
  // shared chat link silently lost the diff it was sent to show.
  test('round-trips a provider turn id that carries no `turn-` prefix', () => {
    for (const raw of ['019423ab-7c1d-4e2f', 'msg_01H8XYZ', '42']) {
      const turnId = raw as TurnId
      const param = diffScopeParam({ filePath: null, kind: 'turn', turnId })

      expect(param).toBe(raw)
      expect(diffScopeFor(param)).toEqual({ filePath: null, kind: 'turn', turnId })
    }
  })

  test('round-trips the prefixed form too, which is what the fixtures use', () => {
    const turnId = 'turn-4a1b' as TurnId

    expect(diffScopeFor(diffScopeParam({ filePath: null, kind: 'turn', turnId }))).toEqual({
      filePath: null,
      kind: 'turn',
      turnId,
    })
  })

  test('reads an absent scope as absent rather than as a turn', () => {
    expect(diffScopeParam(null)).toBeNull()
    expect(diffScopeFor(null)).toBeNull()
    expect(diffScopeFor('')).toBeNull()
  })
})
