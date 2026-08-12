import { render } from '@testing-library/react'

import { useTerminalCommandInbox } from '@/features/terminal/hooks/use-terminal-command-inbox'
import {
  resetTerminalCommandInboxStore,
  useTerminalCommandInboxStore,
} from '@/features/terminal/state/command-inbox-store'
import { expect, test } from '../../../../../test/fixtures'

test('runs a command that was queued before any terminal existed', () => {
  resetTerminalCommandInboxStore()
  useTerminalCommandInboxStore.getState().queueCommand('bun run test')
  const sent: string[] = []

  render(<Terminal active connected sent={sent} />)

  // The carriage return is the whole difference between running a command and
  // leaving it sitting on the prompt.
  expect(sent).toEqual(['bun run test\r'])
  expect(useTerminalCommandInboxStore.getState().pending).toEqual([])
})

test('leaves the work queued while no terminal is active', () => {
  resetTerminalCommandInboxStore()
  const sent: string[] = []
  const view = render(<Terminal active={false} connected sent={sent} />)

  useTerminalCommandInboxStore.getState().queueCommand('bun run dev')
  view.rerender(<Terminal active={false} connected sent={sent} />)

  // A workspace can hold several terminals. Firing into a background one is a
  // command the user never sees run, so the queue waits for the active one.
  expect(sent).toEqual([])
  expect(useTerminalCommandInboxStore.getState().pending).toEqual(['bun run dev'])

  view.rerender(<Terminal active connected sent={sent} />)

  expect(sent).toEqual(['bun run dev\r'])
})

test('waits for the socket rather than writing into a connection that is not up', () => {
  resetTerminalCommandInboxStore()
  useTerminalCommandInboxStore.getState().queueCommand('bun run build')
  const sent: string[] = []
  const view = render(<Terminal active connected={false} sent={sent} />)

  expect(sent).toEqual([])
  expect(useTerminalCommandInboxStore.getState().pending).toEqual(['bun run build'])

  view.rerender(<Terminal active connected sent={sent} />)

  expect(sent).toEqual(['bun run build\r'])
})

/**
 * A stand-in for `TerminalPanel`'s two inputs to this hook: whether it is the
 * active terminal with a live socket, and the ref holding the socket writer.
 *
 * The ref is built outside the component the way the panel's is written from an
 * effect event — assigning `.current` during render is the thing the compiler
 * lint forbids, and doing it here would test a shape production never has.
 */
function Terminal({
  active,
  connected,
  sent,
}: {
  readonly active: boolean
  readonly connected: boolean
  readonly sent: string[]
}) {
  useTerminalCommandInbox({
    active: active && connected,
    sendInputRef: senderRef(sent),
  })

  return null
}

const senderRefBySink = new WeakMap<string[], { current: (data: string) => boolean }>()

function senderRef(sent: string[]) {
  const existing = senderRefBySink.get(sent)
  if (existing) return existing

  const ref = {
    current: (data: string) => {
      sent.push(data)
      return true
    },
  }
  senderRefBySink.set(sent, ref)

  return ref
}
