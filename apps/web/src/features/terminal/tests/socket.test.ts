import { describe, expect, it } from 'vitest'

import { encodeTerminalClientMessage } from '@/features/terminal/utils/socket'

describe('terminal socket client', () => {
  it('sends input bytes unchanged, including partial UTF-8 and control bytes', () => {
    const bytes = new Uint8Array([0, 255, 226, 130, 27, 3, 4])
    expect(encodeTerminalClientMessage({ type: 'input', data: bytes })).toBe(bytes)
  })

  it('encodes client protocol messages', () => {
    expect(encodeTerminalClientMessage({ type: 'resize', cols: 120, rows: 32 })).toBe(
      '{"type":"resize","cols":120,"rows":32}',
    )
    expect(encodeTerminalClientMessage({ type: 'dispose' })).toBe('{"type":"dispose"}')
  })
})
