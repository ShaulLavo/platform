import { describe, expect, it } from 'vitest'

import { encodeTerminalClientMessage } from './terminal-socket'

describe('terminal socket client', () => {
  it('encodes client protocol messages', () => {
    expect(encodeTerminalClientMessage({ type: 'resize', cols: 120, rows: 32 })).toBe(
      '{"type":"resize","cols":120,"rows":32}',
    )
    expect(encodeTerminalClientMessage({ type: 'dispose' })).toBe('{"type":"dispose"}')
  })
})
