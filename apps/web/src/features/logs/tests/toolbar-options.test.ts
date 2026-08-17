import { describe, expect, it } from 'vitest'

import { logBreakdownOptionValues } from '@/features/logs/utils/toolbar-options'

describe('logBreakdownOptionValues', () => {
  it('keeps the current source or area selectable when the filtered summary omits it', () => {
    expect(logBreakdownOptionValues([{ count: 2, value: 'client' }], 'be')).toEqual([
      'be',
      'client',
    ])
  })

  it('does not duplicate selected values already present in the summary breakdown', () => {
    expect(logBreakdownOptionValues([{ count: 2, value: 'editor' }], 'editor')).toEqual(['editor'])
  })
})
