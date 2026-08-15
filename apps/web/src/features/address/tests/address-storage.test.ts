import { describe, afterEach, beforeEach } from 'vitest'

import { expect, test } from '../../../../test/fixtures'

import { parseAddress } from '@/features/address/utils/grammar'
import { readAddressCache, writeAddressCache } from '@/features/address/state/address-storage'

/**
 * The localStorage half of the dual serialization, which had no tests — and that is how
 * a re-encoding bug reached the running app: `writeAddressCache` stripped dev params
 * through `url.searchParams.delete`, and merely touching `searchParams` re-serializes
 * the whole query, re-escaping the `/` and `~` that `?tabs=` leaves bare.
 */

const TABS = '/~repo/workbench/f/src/a.ts?tabs=f/src/a.ts~f/src/b.ts&side=git'

// The `node` project has no `localStorage`; this mirrors the shim `workspace-cache.test.ts`
// already installs rather than growing a second way to do the same thing.
const STORE = new Map<string, string>()

describe('writeAddressCache', () => {
  beforeEach(() => {
    STORE.clear()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => STORE.get(key) ?? null,
        key: (index: number) => Array.from(STORE.keys())[index] ?? null,
        get length() {
          return STORE.size
        },
        removeItem: (key: string) => {
          STORE.delete(key)
        },
        setItem: (key: string, value: string) => {
          STORE.set(key, value)
        },
      },
    })
  })

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage
  })

  // The regression: what is stored has to be what the parser reads back.
  test('stores the address in the shape the parser reads', () => {
    writeAddressCache(TABS)

    expect(readAddressCache()).toBe(TABS)
    expect(parseAddress(readAddressCache() ?? '').tabs).toEqual(['f/src/a.ts', 'f/src/b.ts'])
  })

  test('does not re-escape the bare slashes and separators in `?tabs=`', () => {
    writeAddressCache(TABS)

    expect(readAddressCache()).not.toContain('%2F')
    expect(readAddressCache()).not.toContain('%7E')
  })

  // A dev param is opt-in for the session someone typed it into, never for the machine.
  test('strips dev params without disturbing the rest', () => {
    writeAddressCache(`${TABS}&decode=diffusion&editorPerfTrace=1`)

    const stored = readAddressCache() ?? ''
    expect(stored).not.toContain('decode=')
    expect(stored).not.toContain('editorPerfTrace')
    expect(parseAddress(stored).tabs).toEqual(['f/src/a.ts', 'f/src/b.ts'])
    expect(parseAddress(stored).side).toBe('git')
  })

  test('leaves an address with no query alone', () => {
    writeAddressCache('/~repo/workbench/f/src/a.ts')

    expect(readAddressCache()).toBe('/~repo/workbench/f/src/a.ts')
  })

  test('keeps the fragment, which names the position', () => {
    writeAddressCache('/~repo/workbench/f/src/a.ts?decode=diffusion#L21,9')

    expect(readAddressCache()).toBe('/~repo/workbench/f/src/a.ts#L21,9')
  })
})
