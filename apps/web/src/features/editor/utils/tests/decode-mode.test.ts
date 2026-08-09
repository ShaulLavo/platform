import { describe, expect, it } from 'vitest'

import { requestedDecodeMode } from '@/features/editor/utils/decode-mode'

describe('requestedDecodeMode', () => {
  it('is off unless the URL asks for it', () => {
    expect(requestedDecodeMode('')).toBeNull()
    expect(requestedDecodeMode('?workspace=/tmp/repo')).toBeNull()
  })

  it('reads an explicit mode', () => {
    expect(requestedDecodeMode('?decode=diffusion')).toBe('diffusion')
    expect(requestedDecodeMode('?decode=token')).toBe('token')
    expect(requestedDecodeMode('?decode=autoregressive')).toBe('autoregressive')
  })

  it('falls back to the default mode for truthy switches', () => {
    expect(requestedDecodeMode('?decode=1')).toBe('diffusion')
    expect(requestedDecodeMode('?decode=on')).toBe('diffusion')
  })

  it('ignores unknown and empty values', () => {
    expect(requestedDecodeMode('?decode=sparkle')).toBeNull()
    expect(requestedDecodeMode('?decode=')).toBeNull()
  })
})
