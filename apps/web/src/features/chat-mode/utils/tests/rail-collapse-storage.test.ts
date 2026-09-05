import { testScopedStorage } from '../../../../../test/factories/scoped-storage'
import { projectIdSchema } from '@workspace/contracts'
import { afterEach, beforeEach } from 'vitest'
import * as v from 'valibot'

import {
  readPersistedRailCollapse,
  writePersistedRailCollapse,
} from '@/features/chat-mode/utils/rail-collapse-storage'
import { expect, test } from '../../../../../test/fixtures'

const STORAGE_KEY = 'platform.chat-rail-collapse.v1'
const STORE = new Map<string, string>()

const platformId = v.parse(projectIdSchema, 'fcad4a69-3e68-5de2-8303-a2c1ebe8f60c')
const siteId = v.parse(projectIdSchema, '9b1fd4f4-7ba9-5967-87f0-3efd01bbc4d5')

beforeEach(() => {
  STORE.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => STORE.get(key) ?? null,
      removeItem: (key: string) => STORE.delete(key),
      setItem: (key: string, value: string) => STORE.set(key, value),
    },
  })
})

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage
})

test('a collapsed group is still collapsed after a reload', () => {
  writePersistedRailCollapse(testScopedStorage, [platformId, siteId])

  expect(readPersistedRailCollapse(testScopedStorage)).toEqual([platformId, siteId])
})

test('nothing stored reads as nothing collapsed', () => {
  expect(readPersistedRailCollapse(testScopedStorage)).toEqual([])
})

test('junk in storage re-expands everything instead of throwing', () => {
  testScopedStorage.setItem(STORAGE_KEY, '{"collapsedProjectIds":[7],"version":1}')
  expect(readPersistedRailCollapse(testScopedStorage)).toEqual([])

  testScopedStorage.setItem(STORAGE_KEY, 'not json at all')
  expect(readPersistedRailCollapse(testScopedStorage)).toEqual([])
})

test('an unavailable store costs a re-expanded group, never a thrown click', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      },
    },
  })

  expect(() => writePersistedRailCollapse(testScopedStorage, [platformId])).not.toThrow()
  expect(readPersistedRailCollapse(testScopedStorage)).toEqual([])
})
