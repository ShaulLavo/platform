import { projectIdSchema, threadIdSchema } from '@workspace/contracts'
import * as v from 'valibot'

import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import { expect, test } from '../../../../../test/fixtures'

const projectA = v.parse(projectIdSchema, 'project-a')
const projectB = v.parse(projectIdSchema, 'project-b')
const threadA = v.parse(threadIdSchema, 'thread-a')
const threadB = v.parse(threadIdSchema, 'thread-b')
const threadC = v.parse(threadIdSchema, 'thread-c')
// Rail order: newest first.
const railOrder = [threadA, threadB, threadC]

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

test('releasing the session on stage lands on the row below it', () => {
  const store = reset()
  store.selectSession(projectA, threadB)

  store.releaseSession(threadB, railOrder)

  expect(useSessionSelectionStore.getState().selection).toEqual({
    kind: 'session',
    projectId: projectA,
    threadId: threadC,
  })
})

test('releasing the last session falls back to the row above it', () => {
  const store = reset()
  store.selectSession(projectA, threadC)

  store.releaseSession(threadC, railOrder)

  expect(useSessionSelectionStore.getState().selection).toEqual({
    kind: 'session',
    projectId: projectA,
    threadId: threadB,
  })
})

test('releasing the only session leaves the stage on the auto pick', () => {
  const store = reset()
  store.selectSession(projectA, threadA)

  store.releaseSession(threadA, [threadA])

  expect(useSessionSelectionStore.getState().selection).toEqual({ kind: 'auto' })
})

test('releasing some other session leaves the pick alone', () => {
  const store = reset()
  store.selectSession(projectA, threadB)

  store.releaseSession(threadA, railOrder)

  expect(useSessionSelectionStore.getState().selection).toEqual({
    kind: 'session',
    projectId: projectA,
    threadId: threadB,
  })
})
