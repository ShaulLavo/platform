import { projectIdSchema, threadIdSchema } from '@workspace/contracts'
import * as v from 'valibot'

import {
  selectChatSidebarThreads,
  selectChatSidebarThreadsForProject,
} from '@/features/chat/state/chat-projection-selectors'
import { createInitialChatProjectionState } from '@/features/chat/state/chat-projection-store'
import { syncChatProjectionShellSnapshot } from '@/features/chat/state/chat-projection-writers'
import { activeSession } from '@/features/chat-mode/utils/active-session'
import { compareSessionsByCreation } from '@/features/chat-mode/utils/session-order'
import { sessionRailModel } from '@/features/chat-mode/utils/session-rail-model'
import { chatProject, threadShell } from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'

const projectId = v.parse(projectIdSchema, 'project-platform')
const archivedId = v.parse(threadIdSchema, 'thread-archived')
const liveId = v.parse(threadIdSchema, 'thread-live')

test('the stage never opens a session the rail refuses to draw', () => {
  const state = projection()
  const stageThreadIds = selectChatSidebarThreadsForProject(state, projectId)
    .toSorted(compareSessionsByCreation)
    .map((thread) => thread.id)
  const rail = sessionRailModel({
    activeProjectId: projectId,
    projects: [chatProject({ id: projectId })],
    threads: selectChatSidebarThreads(state),
  })

  // The newest thread is archived: auto-picking it would strand the stage on a
  // conversation with no row to select or leave.
  expect(stageThreadIds).toEqual(rail.sessions.map((session) => session.id))
  expect(
    activeSession({ projectId, selection: { kind: 'auto' }, threadIds: stageThreadIds }),
  ).toEqual({ status: 'auto', threadId: liveId })
})

test('an archived session the user picked still reaches the stage', () => {
  expect(
    activeSession({
      archivedThreadIds: [archivedId],
      projectId,
      selection: { kind: 'session', projectId, threadId: archivedId },
      threadIds: [liveId],
    }),
  ).toEqual({ status: 'ready', threadId: archivedId })
})

function projection() {
  return syncChatProjectionShellSnapshot(createInitialChatProjectionState(), {
    projects: [chatProject({ id: projectId })],
    snapshotSequence: 1,
    threads: [
      threadShell({
        archivedAt: '2026-05-10T00:00:00.000Z',
        id: archivedId,
        createdAt: '2026-05-09T00:00:00.000Z',
        projectId,
        title: 'Archived newest',
      }),
      threadShell({
        id: liveId,
        createdAt: '2026-05-01T00:00:00.000Z',
        projectId,
        title: 'Still listed',
      }),
    ],
    updatedAt: '2026-05-10T00:00:00.000Z',
  })
}
