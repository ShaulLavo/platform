import { describe, expect, test } from 'vitest'

import { searchRuntimeEnabled } from '@/components/workspace/search/utils/search-runtime-state'

describe('workspace search runtime state', () => {
  test('runs when a workspace root exists', () => {
    expect(searchRuntimeEnabled('/workspace')).toBe(true)
  })

  test('stays idle without a workspace root', () => {
    expect(searchRuntimeEnabled('')).toBe(false)
  })
})
