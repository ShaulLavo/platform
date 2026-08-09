import { projectIdSchema, threadIdSchema } from '@workspace/contracts'
import * as v from 'valibot'

import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import { expect, test } from '../../../../../test/fixtures'

const projectA = v.parse(projectIdSchema, 'project-a')
const projectB = v.parse(projectIdSchema, 'project-b')
const threadB = v.parse(threadIdSchema, 'thread-b')

function reset() {
  useSessionSelectionStore.setState({ selection: { kind: 'auto' } })

  return useSessionSelectionStore.getState()
}

test('a session pick records both the project and the thread', () => {
  const store = reset()

  store.selectSession(projectB, threadB)

  expect(useSessionSelectionStore.getState().selection).toEqual({
    kind: 'session',
    projectId: projectB,
    threadId: threadB,
  })
})

test('a new-session request stays a request for that project alone', () => {
  const store = reset()
  store.selectSession(projectA, threadB)

  store.startDraft(projectB)

  expect(useSessionSelectionStore.getState().selection).toEqual({
    kind: 'draft',
    projectId: projectB,
  })
})
