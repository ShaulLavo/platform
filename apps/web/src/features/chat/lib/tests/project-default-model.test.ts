import { providerInstanceIdSchema, type ModelSelection } from '@workspace/contracts'
import * as v from 'valibot'

import {
  createProjectDefaultModelCommand,
  createWorkspaceProjectCommand,
  workspaceProjectId,
} from '@/features/chat/lib/chat-command-builders'
import { expect, test } from '../../../../../test/fixtures'

const claudeSelection: ModelSelection = {
  model: 'claude-opus-5',
  providerInstanceId: v.parse(providerInstanceIdSchema, 'claude'),
}

test('a new project stores no invented model default', async ({ client }) => {
  const rootPath = '/workspace/no-default'
  await dispatch(client, createWorkspaceProjectCommand({ createdAt: now(), rootPath }))

  const project = await readProject(client, rootPath)
  expect(project?.defaultModelSelection).toBeNull()
})

test('picking a model persists it as the project default', async ({ client }) => {
  const rootPath = '/workspace/persisted'
  await dispatch(client, createWorkspaceProjectCommand({ createdAt: now(), rootPath }))

  await dispatch(
    client,
    createProjectDefaultModelCommand({
      defaultModelSelection: claudeSelection,
      projectId: workspaceProjectId(rootPath),
      updatedAt: now(),
    }),
  )

  const project = await readProject(client, rootPath)
  expect(project?.defaultModelSelection).toEqual(claudeSelection)
  expect(project?.title).toBe('persisted')
})

test('a metadata update that omits the model leaves the stored default alone', async ({
  client,
}) => {
  const rootPath = '/workspace/rename-safe'
  const projectId = workspaceProjectId(rootPath)
  await dispatch(client, createWorkspaceProjectCommand({ createdAt: now(), rootPath }))
  await dispatch(
    client,
    createProjectDefaultModelCommand({
      defaultModelSelection: claudeSelection,
      projectId,
      updatedAt: now(),
    }),
  )

  // A rename carries no defaultModelSelection. Collapsing absent onto null here is
  // what would silently wipe the user's remembered model.
  await dispatch(client, {
    commandId: crypto.randomUUID(),
    projectId,
    title: 'Renamed',
    type: 'project.meta.update',
    updatedAt: now(),
  })

  const project = await readProject(client, rootPath)
  expect(project?.title).toBe('Renamed')
  expect(project?.defaultModelSelection).toEqual(claudeSelection)
})

function now() {
  return new Date().toISOString()
}

async function dispatch(
  client: { orchestration: { commands: { post: Function } } },
  command: unknown,
) {
  const response = await client.orchestration.commands.post(command)
  expect(response.error).toBeNull()

  return response
}

async function readProject(
  client: { orchestration: { 'shell-snapshot': { get: Function } } },
  rootPath: string,
) {
  const snapshot = await client.orchestration['shell-snapshot'].get()
  expect(snapshot.error).toBeNull()

  return snapshot.data.projects.find(
    (project: { id: string }) => project.id === workspaceProjectId(rootPath),
  )
}
