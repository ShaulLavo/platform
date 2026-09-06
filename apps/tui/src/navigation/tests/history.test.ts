import { createHistory } from '@/navigation/state/history'
import { test, expect } from '../../../test/fixtures'

test('address history preserves filters, traverses without duplicating entries, and drops abandoned forward locations', () => {
  const history = createHistory({ kind: 'settings', query: '' })
  history.replace({ kind: 'settings', query: 'theme' })
  history.visit({ kind: 'files', path: 'src', rootPath: '' })
  history.visit({ kind: 'files', path: 'src/a.ts', rootPath: '' })
  expect(history.go(-1)).toEqual({ kind: 'files', path: 'src', rootPath: '' })
  history.visit({ kind: 'files', path: 'src', rootPath: '' })
  expect(history.getSnapshot().canGoForward).toBe(true)
  expect(history.go(-1)).toEqual({ kind: 'settings', query: 'theme' })
  expect(history.go(-1)).toBeNull()
  expect(history.go(1)).toEqual({ kind: 'files', path: 'src', rootPath: '' })
  history.visit({ kind: 'settings', query: 'editor' })
  expect(history.go(1)).toBeNull()
  expect(history.go(-1)).toEqual({ kind: 'files', path: 'src', rootPath: '' })
})
