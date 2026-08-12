import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as v from 'valibot'
import { orchestrationCommandSchema, type OrchestrationCommand } from '@workspace/contracts'

import { migrateOrchestrationDatabase } from '../../db/migrations'
import * as schema from '../../db/schema'
import { createWorkspacePaths } from '../../fs/path'
import { GitService } from '../../git/service'
import { OrchestrationEngine } from '../engine'
import { MockProviderAdapter } from '../../provider/adapters/mock'
import { ProviderAdapterRegistry } from '../../provider/provider-adapter-registry'

const roots: string[] = []
const closers: Array<() => void> = []

afterEach(async () => {
  for (const close of closers.splice(0)) close()
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })))
})

describe('thread branch reactor', () => {
  it('stamps the branch the thread’s checkout is actually on', async () => {
    const root = await gitRepo('feature/login')
    const engine = createEngine(root)

    await startThread(engine, root)
    await engine.providerRuntimeIdle()

    // Nothing wrote this field before: the command carried it, the projection
    // stored it, and the only producer sent null forever — so every affordance
    // gated on `session.branch` was unreachable.
    expect(threadBranch(engine)).toBe('feature/login')
  })

  it('follows the checkout when a later turn starts on a different branch', async () => {
    const root = await gitRepo('main')
    const engine = createEngine(root)

    await startThread(engine, root)
    await engine.providerRuntimeIdle()
    expect(threadBranch(engine)).toBe('main')

    await runGit(root, ['checkout', '-b', 'feature/second'])
    await engine.dispatch(turnStartCommand('cmd-turn-2', 'turn-2', 'message-2'))
    await engine.providerRuntimeIdle()

    expect(threadBranch(engine)).toBe('feature/second')
  })

  it('leaves the branch null for a directory that is not a repository', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'platform-branch-plain-'))
    roots.push(root)
    await writeFile(path.join(root, 'readme.md'), 'no git here\n')
    const engine = createEngine(root)

    await startThread(engine, root)
    await engine.providerRuntimeIdle()

    // A missing repository and a detached head both read as null. The thread
    // already holds null, so this must also not churn an event per turn.
    expect(threadBranch(engine)).toBeNull()
    const stamps = engine
      .replay({ afterSequence: 0 })
      .events.filter((event) => event.type === 'thread.meta-updated')
    expect(stamps).toHaveLength(0)
  })
})

function threadBranch(engine: OrchestrationEngine) {
  return engine.readModelSnapshot().threads.get('thread-1')?.branch ?? null
}

function createEngine(workspaceRoot: string) {
  const sqlite = new Database(':memory:', { create: true })
  closers.push(() => sqlite.close())
  const database = drizzle({ client: sqlite, schema })
  migrateOrchestrationDatabase(database)

  return new OrchestrationEngine(database, {
    providerRuntime: {
      adapterRegistry: new ProviderAdapterRegistry([new MockProviderAdapter()]),
      checkpointGit: new GitService(createWorkspacePaths(workspaceRoot)),
    },
  })
}

async function startThread(engine: OrchestrationEngine, workspaceRoot: string) {
  await engine.dispatch(
    command({
      commandId: 'cmd-project-create',
      defaultModelSelection: null,
      projectId: 'project-1',
      title: 'Platform',
      type: 'project.create',
      workspaceRoot,
    }),
  )
  await engine.dispatch(
    command({
      branch: null,
      commandId: 'cmd-thread-create',
      interactionMode: 'default',
      modelSelection: { model: 'gpt-5-codex', providerInstanceId: 'codex' },
      projectId: 'project-1',
      runtimeMode: 'full-access',
      threadId: 'thread-1',
      title: 'Session',
      type: 'thread.create',
      worktreePath: null,
    }),
  )
  await engine.dispatch(turnStartCommand('cmd-turn-1', 'turn-1', 'message-1'))
}

function turnStartCommand(commandId: string, turnId: string, messageId: string) {
  return command({
    commandId,
    interactionMode: 'default',
    message: { attachments: [], messageId, role: 'user', text: 'Build it' },
    runtimeMode: 'full-access',
    threadId: 'thread-1',
    turnId,
    type: 'thread.turn.start',
  })
}

function command(value: unknown) {
  return v.parse(orchestrationCommandSchema, value) as OrchestrationCommand
}

async function gitRepo(branch: string) {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-branch-'))
  roots.push(root)
  await runGit(root, ['init', '-b', branch])
  await runGit(root, ['config', 'user.email', 'test@example.com'])
  await runGit(root, ['config', 'user.name', 'Test User'])
  await writeFile(path.join(root, 'readme.md'), 'one\n')
  await runGit(root, ['add', 'readme.md'])
  await runGit(root, ['commit', '-m', 'initial'])

  return root
}

async function runGit(root: string, args: readonly string[]) {
  const child = Bun.spawn(['git', '-C', root].concat(args), { stderr: 'pipe', stdout: 'pipe' })
  const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited])
  if (exitCode !== 0) throw new Error(stderr.trim())
}
