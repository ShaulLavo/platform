import { beforeEach } from 'vitest'

import {
  resetComposerInboxStore,
  useComposerInboxStore,
} from '@/features/chat/state/composer-inbox-store'
import { expect, test } from '../../../../../test/fixtures'

const FAILURE = {
  lineEnd: 812,
  lineStart: 810,
  source: 'terminal-1',
  text: 'make: *** [build] Error 1',
}

beforeEach(resetComposerInboxStore)

function inbox() {
  return useComposerInboxStore.getState()
}

test('a capture waits until a composer takes it', () => {
  inbox().queueTerminalContext(FAILURE)

  expect(useComposerInboxStore.getState().pending).toHaveLength(1)

  const taken = useComposerInboxStore.getState().take(() => true)

  expect(taken).toEqual([
    { context: expect.objectContaining({ text: FAILURE.text }), kind: 'terminal-context' },
  ])
  expect(useComposerInboxStore.getState().pending).toHaveLength(0)
})

test('taking twice never hands the same work over twice', () => {
  inbox().queueTerminalContext(FAILURE)
  useComposerInboxStore.getState().take(() => true)

  expect(useComposerInboxStore.getState().take(() => true)).toHaveLength(0)
})

test('text and chips queue through the same seam, in the order they arrived', () => {
  const store = inbox()
  store.queueText('look at this')
  store.queueTerminalContext(FAILURE)

  // One mechanism, two entry kinds: the point of the seam is that a new capture
  // surface picks a kind rather than growing a handle of its own.
  expect(
    useComposerInboxStore
      .getState()
      .take(() => true)
      .map((entry) => entry.kind),
  ).toEqual(['text', 'terminal-context'])
})

test('nothing worth inserting is refused rather than queued', () => {
  const store = inbox()

  expect(store.queueText('   \n ')).toBe(false)
  expect(store.queueTerminalContext({ ...FAILURE, text: '  \n ' })).toBeNull()
  expect(store.queueTerminalContext({ ...FAILURE, source: ' ' })).toBeNull()
  expect(useComposerInboxStore.getState().pending).toHaveLength(0)
})

test('a refused entry leaves the queue untouched, so no effect wakes itself', () => {
  inbox().queueText('needs a caret')

  // Identity, not just length: the drain effect is keyed on `pending`, so a
  // no-op take that minted a new array would re-run it forever.
  const before = useComposerInboxStore.getState().pending
  expect(useComposerInboxStore.getState().take((entry) => entry.kind !== 'text')).toHaveLength(0)
  expect(useComposerInboxStore.getState().pending).toBe(before)
})

test('captures keep their order and each gets its own id', () => {
  const store = inbox()
  store.queueTerminalContext(FAILURE)
  store.queueTerminalContext({ ...FAILURE, lineEnd: 900, lineStart: 900, text: 'second' })

  const contexts = useComposerInboxStore
    .getState()
    .take(() => true)
    .flatMap((entry) => (entry.kind === 'terminal-context' ? [entry.context] : []))

  expect(contexts.map((context) => context.text)).toEqual([FAILURE.text, 'second'])
  expect(new Set(contexts.map((context) => context.id)).size).toBe(2)
})
