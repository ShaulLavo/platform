import {
  resetTerminalContextInboxStore,
  useTerminalContextInboxStore,
} from '@/features/chat/state/terminal-context-inbox-store'
import { expect, test } from '../../../../../test/fixtures'

const FAILURE = {
  lineEnd: 812,
  lineStart: 810,
  source: 'terminal-1',
  text: 'make: *** [build] Error 1',
}

function inbox() {
  resetTerminalContextInboxStore()

  return useTerminalContextInboxStore.getState()
}

test('a queued capture waits until something drains it', () => {
  inbox().queue(FAILURE)

  expect(useTerminalContextInboxStore.getState().pending).toHaveLength(1)

  const drained = useTerminalContextInboxStore.getState().drain()

  expect(drained.map((context) => context.text)).toEqual([FAILURE.text])
  expect(useTerminalContextInboxStore.getState().pending).toHaveLength(0)
})

test('draining twice never hands the same capture over twice', () => {
  inbox().queue(FAILURE)
  const store = useTerminalContextInboxStore.getState()
  store.drain()

  expect(store.drain()).toHaveLength(0)
})

test('a whitespace-only capture is refused rather than queued as an empty chip', () => {
  const queued = inbox().queue({ ...FAILURE, text: '   \n\n  ' })

  expect(queued).toBeNull()
  expect(useTerminalContextInboxStore.getState().pending).toHaveLength(0)
})

test('a capture from a terminal with no id is refused', () => {
  expect(inbox().queue({ ...FAILURE, source: '  ' })).toBeNull()
})

test('captures keep their order and each gets its own id', () => {
  const store = inbox()
  store.queue(FAILURE)
  store.queue({ ...FAILURE, lineEnd: 900, lineStart: 900, text: 'second' })

  const drained = useTerminalContextInboxStore.getState().drain()

  expect(drained.map((context) => context.text)).toEqual([FAILURE.text, 'second'])
  expect(new Set(drained.map((context) => context.id)).size).toBe(2)
})
