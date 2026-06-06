import { describe, expect, it } from 'vitest'

import {
  parseTerminalClientMessage,
  parseTerminalServerMessage,
  TERMINAL_MAX_COLS,
  TERMINAL_MAX_ROWS,
  TERMINAL_MIN_COLS,
  TERMINAL_MIN_ROWS,
} from '../terminal'

describe('terminal protocol', () => {
  it('parses client input messages from objects and JSON strings', () => {
    expect(parseTerminalClientMessage({ type: 'input', data: 'pwd\r' })).toEqual({
      type: 'input',
      data: 'pwd\r',
    })
    expect(parseTerminalClientMessage('{"type":"input","data":"ls\\r"}')).toEqual({
      type: 'input',
      data: 'ls\r',
    })
  })

  it('normalizes client resize dimensions to bounded integers', () => {
    expect(
      parseTerminalClientMessage({
        cols: TERMINAL_MAX_COLS + 50,
        rows: TERMINAL_MIN_ROWS + 0.8,
        type: 'resize',
      }),
    ).toEqual({
      cols: TERMINAL_MAX_COLS,
      rows: TERMINAL_MIN_ROWS,
      type: 'resize',
    })
    expect(
      parseTerminalClientMessage({
        cols: TERMINAL_MIN_COLS - 100,
        rows: TERMINAL_MAX_ROWS + 100,
        type: 'resize',
      }),
    ).toEqual({
      cols: TERMINAL_MIN_COLS,
      rows: TERMINAL_MAX_ROWS,
      type: 'resize',
    })
  })

  it('parses client dispose messages', () => {
    expect(parseTerminalClientMessage({ type: 'dispose' })).toEqual({ type: 'dispose' })
    expect(parseTerminalClientMessage('{"type":"dispose"}')).toEqual({ type: 'dispose' })
  })

  it('rejects malformed client messages', () => {
    expect(parseTerminalClientMessage('{')).toBeNull()
    expect(parseTerminalClientMessage({ type: 'input', data: 1 })).toBeNull()
    expect(parseTerminalClientMessage({ type: 'resize', cols: '80', rows: 24 })).toBeNull()
    expect(parseTerminalClientMessage({ type: 'unknown' })).toBeNull()
  })

  it('parses server messages and rejects malformed payloads', () => {
    expect(
      parseTerminalServerMessage({
        cwd: '/workspace',
        shell: '/bin/zsh',
        type: 'ready',
      }),
    ).toEqual({
      cwd: '/workspace',
      shell: '/bin/zsh',
      type: 'ready',
    })
    expect(parseTerminalServerMessage('{"type":"output","data":"ok"}')).toEqual({
      data: 'ok',
      type: 'output',
    })
    expect(parseTerminalServerMessage({ type: 'exit', exitCode: null })).toEqual({
      exitCode: null,
      type: 'exit',
    })
    expect(parseTerminalServerMessage({ type: 'error', message: 'failed' })).toEqual({
      message: 'failed',
      type: 'error',
    })
    expect(parseTerminalServerMessage({ type: 'exit', exitCode: Number.NaN })).toBeNull()
  })
})
