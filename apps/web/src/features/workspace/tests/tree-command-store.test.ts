import { createTreeCommandStore } from '@/features/workspace/state/tree-command-store'

import { expect, test } from '../../../../test/fixtures'

test('keeps a request pending before the matching tree mounts and acknowledges it once', () => {
  const store = createTreeCommandStore()
  store.request('open-search', '/repo')

  expect(store.getSnapshot()).toEqual({ id: 1, kind: 'open-search', rootPath: '/repo' })
  store.acknowledge(99)
  expect(store.getSnapshot()?.id).toBe(1)
  store.acknowledge(1)
  expect(store.getSnapshot()).toBeNull()
  store.acknowledge(1)
  expect(store.getSnapshot()).toBeNull()
})

test('replaces an older request with the latest complete command', () => {
  const store = createTreeCommandStore()

  store.request('focus', '/repo')
  store.request('reveal-active', '/repo')

  expect(store.getSnapshot()).toEqual({ id: 2, kind: 'reveal-active', rootPath: '/repo' })
})
