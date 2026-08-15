import { describe, expect, it } from 'vitest'

import { emptyAddress, formatAddress, parseAddress } from '@/features/address/utils/grammar'
import type { Address } from '@/features/address/utils/grammar'

function fixedPoint(href: string) {
  const once = formatAddress(parseAddress(href))

  expect(formatAddress(parseAddress(once))).toBe(once)
  return once
}

describe('the path', () => {
  it('treats `/` as no address at all', () => {
    expect(parseAddress('/')).toEqual(emptyAddress())
    expect(formatAddress(emptyAddress())).toBe('/')
  })

  it('names a workspace, a mode and a document', () => {
    const address = parseAddress('/~platform/workbench/f/apps/web/src/main.tsx')

    expect(address.workspace).toBe('platform')
    expect(address.mode).toBe('workbench')
    expect(address.document).toBe('f/apps/web/src/main.tsx')
  })

  it('carries `/~-` for a remembered app with no folder open', () => {
    expect(parseAddress('/~-?settings=Providers')).toMatchObject({
      settings: 'Providers',
      workspace: '-',
    })
    expect(fixedPoint('/~-?settings=Providers')).toBe('/~-?settings=Providers')
  })

  it('ignores a top-level segment that is not a workspace', () => {
    expect(parseAddress('/workbench/f/a.ts').workspace).toBeNull()
  })

  it('falls back to the remembered mode on an unknown one, keeping the rest', () => {
    const address = parseAddress('/~platform/wrkbnch/f/x?side=git')

    expect(address.mode).toBeNull()
    expect(address.side).toBe('git')
  })
})

describe('the fragment', () => {
  it('parses a line, a line and column, and a range', () => {
    expect(parseAddress('/~p/workbench/f/a.ts#L484').focus).toEqual({
      column: null,
      endLine: null,
      line: 484,
    })
    expect(parseAddress('/~p/workbench/f/a.ts#L21,9').focus).toMatchObject({ column: 9, line: 21 })
    expect(parseAddress('/~p/workbench/f/a.ts#L484-L520').focus).toMatchObject({
      endLine: 520,
      line: 484,
    })
  })

  it('round-trips each form to a fixed point', () => {
    for (const hash of ['#L484', '#L21,9', '#L484-L520']) {
      expect(fixedPoint(`/~p/workbench/f/a.ts${hash}`)).toBe(`/~p/workbench/f/a.ts${hash}`)
    }
  })

  it('drops a fragment it cannot read rather than guessing', () => {
    expect(parseAddress('/~p/workbench/f/a.ts#nonsense').focus).toBeNull()
    expect(parseAddress('/~p/workbench/f/a.ts#L0').focus).toBeNull()
  })
})

describe('reserved pass-through', () => {
  // Two of these are read late — editorPerfLayout during every editor render, decode on
  // the first editor's idle callback — so a rewrite that dropped them would change
  // behaviour mid-session with no error and no log.
  it('copies the four dev params through encode -> decode -> encode unchanged', () => {
    const href = '/~platform/workbench?decode=diffusion&editorPerfTrace=1&editorPerfDisable=x'
    const address = parseAddress(href)

    expect(address.passthrough).toEqual({
      decode: 'diffusion',
      editorPerfDisable: 'x',
      editorPerfTrace: '1',
    })
    expect(fixedPoint(href)).toContain('decode=diffusion')
    expect(fixedPoint(href)).toContain('editorPerfTrace=1')
    expect(fixedPoint(href)).toContain('editorPerfDisable=x')
  })

  it('keeps editorPerfLayout, which is read live during render', () => {
    expect(parseAddress('/~p/workbench?editorPerfLayout=transform').passthrough).toEqual({
      editorPerfLayout: 'transform',
    })
  })

  it('does not mistake an owned key for a passthrough one', () => {
    expect(parseAddress('/~p/workbench?side=git&tabs=f/a.ts').passthrough).toEqual({})
  })
})

describe('owned search params', () => {
  it('reads the panel slots', () => {
    const address = parseAddress('/~p/workbench?side=git&bottom=terminal&tool=git&rail=archived')

    expect(address).toMatchObject({
      bottom: 'terminal',
      rail: 'archived',
      side: 'git',
      tool: 'git',
    })
  })

  it('drops a panel value outside its union', () => {
    expect(parseAddress('/~p/workbench?side=nope&bottom=nope')).toMatchObject({
      bottom: null,
      side: null,
    })
  })

  it('splits the tab set on `~`', () => {
    expect(parseAddress('/~p/workbench/f/a.ts?tabs=f/a.ts~f/b.ts~s').tabs).toEqual([
      'f/a.ts',
      'f/b.ts',
      's',
    ])
  })

  // The rail scope is a ProjectId — a one-way hash of an absolute path — so it is not
  // addressable, and `diff` carries the thread diff scope alone.
  it('keeps the thread diff scope on its own key', () => {
    expect(parseAddress('/~p/chat/t/thread-1?diff=turn-4a1b').diff).toBe('turn-4a1b')
  })
})

describe('fixed point over hostile input', () => {
  it('settles after one round for every shape', () => {
    const hrefs = [
      '/',
      '/~platform',
      '/~platform/chat',
      '/~platform/chat/t/thread-9f3a1c2e?tool=git&diff=wt',
      '/~platform/workbench/f/apps/web/src/main.tsx?side=git&bottom=problems#L21,9',
      '/~platform/workbench/s?q=unowned&decode=diffusion',
      '/~platform/workbench/f/a%20b/%C3%BCn%C3%AF.ts#L1',
      '/~platform/workbench/f/a%7Eb.ts',
    ]

    for (const href of hrefs) expect(() => fixedPoint(href)).not.toThrow()
  })

  it('survives malformed percent-escapes without throwing', () => {
    expect(() => parseAddress('/~pl%E0%A4%Aatform/workbench/f/a%.ts')).not.toThrow()
  })

  it('escapes `~` in a slug so it cannot be read as a second segment marker', () => {
    expect(formatAddress({ ...emptyAddress(), workspace: 'a~b' })).toBe('/~a%7Eb')
    expect(parseAddress('/~a%7Eb').workspace).toBe('a~b')
  })
})

describe('the settings slot', () => {
  // An open settings page with no category selected is a real state, and `''` is how
  // the grammar spells it. Treating it as falsy dropped the tab on every reload.
  it('round-trips settings open with no category', () => {
    const href = formatAddress({ ...emptyAddress(), settings: '', workspace: 'p' })

    expect(href).toBe('/~p?settings=')
    expect(parseAddress(href).settings).toBe('')
    expect(fixedPoint(href)).toBe(href)
  })

  it('distinguishes no-category from no-settings', () => {
    expect(parseAddress('/~p').settings).toBeNull()
    expect(parseAddress('/~p?settings=').settings).toBe('')
    expect(parseAddress('/~p?settings=providers').settings).toBe('providers')
  })
})

describe('every owned field survives a round trip', () => {
  // The guard that was missing. `fixedPoint` only proves the string is STABLE, and a
  // serializer that drops a field is perfectly stable — it just drops it every time.
  // Five of the seven owned params were silently lost for exactly this reason.
  const FULL = {
    ...emptyAddress(),
    bottom: 'problems' as const,
    diff: 'turn-4a1b0c22',
    document: 'f/apps/web/src/main.tsx',
    focus: { column: 9, endLine: null, line: 21 },
    logs: { area: 'git', level: 'error' },
    mode: 'workbench' as const,
    passthrough: { decode: 'diffusion' },
    rail: 'archived' as const,
    search: { case: '1', q: 'createError' },
    settings: 'providers',
    side: 'git' as const,
    tabs: ['f/a.ts', 'f/b.ts', 's'],
    tool: 'git',
    workspace: 'platform',
  }

  it('parses back to exactly what was serialized', () => {
    expect(parseAddress(formatAddress(FULL))).toEqual(FULL)
  })

  it('names every field in the emitted URL', () => {
    const href = formatAddress(FULL)

    for (const fragment of [
      '/~platform/workbench/f/apps/web/src/main.tsx',
      'tabs=f%2Fa.ts%7Ef%2Fb.ts%7Es',
      'side=git',
      'bottom=problems',
      'tool=git',
      'rail=archived',
      'diff=turn-4a1b0c22',
      'settings=providers',
      'log.level=error',
      's.q=createError',
      'decode=diffusion',
      '#L21,9',
    ]) {
      expect(href, `missing ${fragment}`).toContain(fragment)
    }
  })

  // Field-by-field, so a failure names the field that broke rather than dumping a diff.
  it('round-trips each field independently', () => {
    const cases: [string, Partial<Address>][] = [
      ['tabs', { tabs: ['f/a.ts', 's'] }],
      ['side', { side: 'git' }],
      ['bottom', { bottom: 'terminal' }],
      ['tool', { tool: 'files' }],
      ['rail', { rail: 'archived' }],
      ['diff', { diff: 'wt' }],
      ['settings', { settings: 'models' }],
      ['logs', { logs: { level: 'warn' } }],
      ['search', { search: { q: 'x' } }],
      ['passthrough', { passthrough: { editorPerfTrace: '1' } }],
      ['focus', { focus: { column: null, endLine: 40, line: 12 } }],
    ]

    for (const [name, patch] of cases) {
      const address = { ...emptyAddress(), mode: 'workbench' as const, workspace: 'p', ...patch }
      expect(parseAddress(formatAddress(address)), `${name} did not survive`).toEqual(address)
    }
  })
})
