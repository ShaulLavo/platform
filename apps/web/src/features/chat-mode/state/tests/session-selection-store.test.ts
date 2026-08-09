import { projectIdSchema, threadIdSchema } from '@workspace/contracts'
import * as v from 'valibot'

import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import { expect, test } from '../../../../../test/fixtures'

const projectA = v.parse(projectIdSchema, 'project-a')
const projectB = v.parse(projectIdSchema, 'project-b')
const threadB = v.parse(threadIdSchema, 'thread-b')

function reset() {
  useSessionSelectionStore.setState({
    pendingWorkspaceRoot: null,
    selection: { kind: 'auto' },
    switchToken: 0,
  })

  return useSessionSelectionStore.getState()
}

test('a later switch supersedes an earlier one still in flight', () => {
  const store = reset()

  const first = store.beginProjectSwitch('/repo/b')
  const second = useSessionSelectionStore.getState().beginProjectSwitch('/repo/c')

  expect(useSessionSelectionStore.getState().isCurrentSwitch(first)).toBe(false)
  expect(useSessionSelectionStore.getState().isCurrentSwitch(second)).toBe(true)
  expect(useSessionSelectionStore.getState().pendingWorkspaceRoot).toBe('/repo/c')
})

test('a failed switch keeps a new-session request as a new session in the open project', () => {
  const store = reset()
  store.startDraft(projectB)
  store.beginProjectSwitch('/repo/b')

  useSessionSelectionStore.getState().abandonProjectSwitch(projectB, projectA)

  const { pendingWorkspaceRoot, selection } = useSessionSelectionStore.getState()
  expect(pendingWorkspaceRoot).toBeNull()
  // Never decays into "show the open project's newest thread" — that would hand the
  // user a live composer over an unrelated conversation.
  expect(selection).toEqual({ kind: 'draft', projectId: projectA })
})

test('a failed session pick goes neutral rather than retargeting another conversation', () => {
  const store = reset()
  store.selectSession(projectB, threadB)
  store.beginProjectSwitch('/repo/b')

  useSessionSelectionStore.getState().abandonProjectSwitch(projectB, projectA)

  expect(useSessionSelectionStore.getState().selection).toEqual({ kind: 'auto' })
})

test('a failure for some other project leaves the current pick alone', () => {
  const store = reset()
  store.selectSession(projectA, threadB)

  useSessionSelectionStore.getState().abandonProjectSwitch(projectB, projectA)

  expect(useSessionSelectionStore.getState().selection).toEqual({
    kind: 'session',
    projectId: projectA,
    threadId: threadB,
  })
})

test('settling clears the pending root without touching the pick', () => {
  const store = reset()
  store.selectSession(projectB, threadB)
  store.beginProjectSwitch('/repo/b')

  useSessionSelectionStore.getState().settleProjectSwitch()

  const { pendingWorkspaceRoot, selection } = useSessionSelectionStore.getState()
  expect(pendingWorkspaceRoot).toBeNull()
  expect(selection).toEqual({ kind: 'session', projectId: projectB, threadId: threadB })
})
