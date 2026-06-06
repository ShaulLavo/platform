import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, it } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as v from 'valibot'
import {
  commandIdSchema,
  messageIdSchema,
  projectIdSchema,
  providerInstanceIdSchema,
  threadIdSchema,
  turnIdSchema,
} from '@workspace/contracts'

import * as schema from '../../db/schema'
import { migrateOrchestrationDatabase } from '../../db/migrations'
import { createWorkspacePaths } from '../../fs/path'
import { GitService } from '../../git/service'
import { OrchestrationEngine } from '../engine'
import { OrchestrationCheckpointDiffQuery } from '../checkpoint-diff-query'
import { checkpointRefForThreadTurn } from '../checkpoint-refs'

const now = '2026-05-29T00:00:00.000Z'
const modelSelection = {
  model: 'gpt-5-codex',
  providerInstanceId: v.parse(providerInstanceIdSchema, 'codex'),
}
const projectId = v.parse(projectIdSchema, 'project-1')
const threadId = v.parse(threadIdSchema, 'thread-1')
const turnId = v.parse(turnIdSchema, 'turn-1')
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })))
})

describe('orchestration checkpoint diff query', () => {
  it('validates empty ranges against a real thread', async () => {
    const root = await fixtureRoot()
    const sqlite = new Database(':memory:', { create: true })
    const database = drizzle({ client: sqlite, schema })
    migrateOrchestrationDatabase(database)
    const checkpointDiff = new OrchestrationCheckpointDiffQuery(
      database,
      new GitService(createWorkspacePaths(root)),
    )

    try {
      await expect(
        checkpointDiff.turnDiff({
          fromTurnCount: 0,
          threadId,
          toTurnCount: 0,
        }),
      ).rejects.toThrow('Thread not found')
    } finally {
      sqlite.close()
    }
  })

  it('reads historical turn diffs from checkpoint refs', async () => {
    const root = await fixtureRoot()
    await initGitRepository(root)
    const turnZeroRef = checkpointRefForThreadTurn(threadId, 0)
    const turnOneRef = checkpointRefForThreadTurn(threadId, 1)

    await writeFile(path.join(root, 'app.txt'), 'before\n')
    await runGit(root, ['add', 'app.txt'])
    await runGit(root, ['commit', '-m', 'turn zero'])
    await runGit(root, ['update-ref', turnZeroRef, 'HEAD'])
    await writeFile(path.join(root, 'app.txt'), 'after\n')
    await runGit(root, ['add', 'app.txt'])
    await runGit(root, ['commit', '-m', 'turn one'])
    await runGit(root, ['update-ref', turnOneRef, 'HEAD'])

    const sqlite = new Database(':memory:', { create: true })
    const database = drizzle({ client: sqlite, schema })
    const engine = new OrchestrationEngine(database)
    const checkpointDiff = new OrchestrationCheckpointDiffQuery(
      database,
      new GitService(createWorkspacePaths(root)),
    )

    try {
      await dispatchCheckpointThread(engine, root, turnOneRef)
      const diffs = await checkpointDiff.turnDiff({
        fromTurnCount: 0,
        threadId,
        toTurnCount: 1,
      })

      expect(diffs).toMatchObject([
        {
          path: 'app.txt',
          hunks: [
            {
              changes: [
                { oldLine: 1, text: 'before', type: 'deleted' },
                { newLine: 1, text: 'after', type: 'added' },
              ],
            },
          ],
        },
      ])
      expect(diffs[0]?.oldObjectId).toEqual(expect.any(String))
      expect(diffs[0]?.newObjectId).toEqual(expect.any(String))
    } finally {
      sqlite.close()
    }
  })
})

async function dispatchCheckpointThread(
  engine: OrchestrationEngine,
  workspaceRoot: string,
  checkpointRef: string,
) {
  await engine.dispatch({
    commandId: v.parse(commandIdSchema, 'cmd-project'),
    createdAt: now,
    defaultModelSelection: modelSelection,
    projectId,
    title: 'Platform',
    type: 'project.create',
    workspaceRoot,
  })
  await engine.dispatch({
    branch: null,
    commandId: v.parse(commandIdSchema, 'cmd-thread'),
    createdAt: now,
    interactionMode: 'default',
    modelSelection,
    projectId,
    runtimeMode: 'full-access',
    threadId,
    title: 'Thread',
    type: 'thread.create',
    worktreePath: workspaceRoot,
  })
  await engine.dispatch({
    assistantMessageId: v.parse(messageIdSchema, 'message-2'),
    checkpointRef,
    checkpointTurnCount: 1,
    commandId: v.parse(commandIdSchema, 'cmd-turn-diff'),
    completedAt: now,
    createdAt: now,
    files: [{ additions: 1, deletions: 1, kind: 'modified', path: 'app.txt' }],
    status: 'ready',
    threadId,
    turnId,
    type: 'thread.turn.diff.complete',
  })
}

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-checkpoint-diff-'))
  roots.push(root)
  await mkdir(root, { recursive: true })

  return root
}

async function initGitRepository(root: string) {
  await runGit(root, ['init'])
  await runGit(root, ['config', 'user.email', 'test@example.com'])
  await runGit(root, ['config', 'user.name', 'Test User'])
}

async function runGit(root: string, args: readonly string[]) {
  const process = Bun.spawn(['git', '-C', root].concat(args), {
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  if (exitCode === 0) return { stderr, stdout }

  throw new Error(`${stderr}${stdout}`.trim())
}
