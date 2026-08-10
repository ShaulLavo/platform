import { providerInstanceIdSchema, type ModelSelection } from '@workspace/contracts'
import { QueryClient } from '@tanstack/react-query'
import * as v from 'valibot'

import {
  createDraftThreadSubmission,
  createWorkspaceProjectCommand,
  workspaceProjectId,
} from '@/features/chat/lib/chat-command-builders'
import {
  isSessionSearchQuery,
  sessionSearchQueryOptions,
} from '@/features/chat-mode/utils/session-search-query'
import { expect, test } from '../../../../../test/fixtures'

// Real server, real routes: the point of this seam is that the rail can find a
// phrase the projection window no longer carries, which only the database knows.

const ROOT_PATH = '/workspace/search'
const modelSelection: ModelSelection = {
  model: 'claude-opus-5',
  providerInstanceId: v.parse(providerInstanceIdSchema, 'claude'),
}

test('a phrase typed into a session is found by searching the messages', async ({ client }) => {
  await seedThread(client, 'The tokenizer fast path drops surrogate pairs.')

  const result = await runSearch('surrogate pairs')

  expect(result.matches).toHaveLength(1)
  expect(result.matches[0]?.snippet).toContain('surrogate pairs')
  expect(result.matches[0]?.source).toBe('user')
  expect(result.matches[0]?.projectId).toBe(workspaceProjectId(ROOT_PATH))
})

test('a phrase nobody wrote finds nothing', async ({ client }) => {
  await seedThread(client, 'The tokenizer fast path drops surrogate pairs.')

  expect((await runSearch('pelican crossing')).matches).toEqual([])
})

test('a one-character query never leaves the browser', ({ client }) => {
  expect(client).toBeDefined()
  expect(isSessionSearchQuery('a')).toBe(false)
  expect(isSessionSearchQuery('  a  ')).toBe(false)
  expect(isSessionSearchQuery('ab')).toBe(true)
  expect(sessionSearchQueryOptions({ query: 'a' }).enabled).toBe(false)
  expect(sessionSearchQueryOptions({ query: 'ab' }).enabled).toBe(true)
})

test('surrounding whitespace does not mint a second cache entry', ({ client }) => {
  expect(client).toBeDefined()

  expect(sessionSearchQueryOptions({ query: '  tokenizer ' }).queryKey).toEqual(
    sessionSearchQueryOptions({ query: 'tokenizer' }).queryKey,
  )
})

function runSearch(query: string) {
  // A throwaway client per call so a cached answer can never stand in for a
  // real round trip.
  return new QueryClient().fetchQuery(sessionSearchQueryOptions({ query }))
}

async function seedThread(
  client: { orchestration: { commands: { post: Function } } },
  text: string,
) {
  await dispatch(client, createWorkspaceProjectCommand({ rootPath: ROOT_PATH }))
  const submission = createDraftThreadSubmission({
    createdAt: new Date().toISOString(),
    modelSelection,
    projectId: workspaceProjectId(ROOT_PATH),
    rootPath: ROOT_PATH,
    text,
  })

  await dispatch(client, submission.command)
}

async function dispatch(
  client: { orchestration: { commands: { post: Function } } },
  command: unknown,
) {
  const response = await client.orchestration.commands.post(command)
  expect(response.error).toBeNull()

  return response
}
