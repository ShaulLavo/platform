import { mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as v from 'valibot'
import { orchestrationCommandSchema, type OrchestrationCommand } from '@workspace/contracts'

import { migrateOrchestrationDatabase } from '../../db/migrations'
import * as schema from '../../db/schema'
import { DEFAULT_MAX_TEXT_FILE_BYTES } from '../../fs/limits'
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

describe('session checkout reactor', () => {
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
  it('prepares the session its own checkout when the turn asks for one', async () => {
    const root = await gitRepo('main')
    const engine = createEngine(root)

    await startThread(engine, root, { requestWorktree: true })
    await engine.providerRuntimeIdle()

    const thread = engine.readModelSnapshot().threads.get('thread-1')
    // A directory of its own, and the branch that goes with it — not `main`,
    // which is what reading the project root would have reported.
    expect(thread?.worktreePath).toBeDefined()
    expect(thread?.worktreePath).not.toBe(root)
    expect(thread?.branch).toBe('session/thread-thread-1')
    expect(await directoryExists(thread?.worktreePath ?? '')).toBe(true)
  })

  it('leaves a session on the project root when it did not ask', async () => {
    const root = await gitRepo('main')
    const engine = createEngine(root)

    await startThread(engine, root)
    await engine.providerRuntimeIdle()

    const thread = engine.readModelSnapshot().threads.get('thread-1')
    expect(thread?.worktreePath).toBe(root)
    expect(thread?.branch).toBe('main')
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
      checkpointGit: new GitService(createWorkspacePaths(workspaceRoot), {
        maxTextFileBytes: DEFAULT_MAX_TEXT_FILE_BYTES,
      }),
    },
  })
}

async function directoryExists(target: string) {
  if (!target) return false

  return stat(target).then(
    (entry) => entry.isDirectory(),
    () => false,
  )
}

async function startThread(
  engine: OrchestrationEngine,
  workspaceRoot: string,
  bootstrap: { requestWorktree?: boolean } = {},
) {
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
  // Through the turn's own bootstrap, which is the only path that carries the
  // worktree intent — a standalone `thread.create` cannot ask for one.
  await engine.dispatch(
    command({
      bootstrap: {
        createThread: {
          interactionMode: 'default',
          modelSelection: { model: 'gpt-5-codex', providerInstanceId: 'codex' },
          projectId: 'project-1',
          title: 'Session',
          worktreePath: workspaceRoot,
          ...bootstrap,
        },
      },
      commandId: 'cmd-turn-1',
      interactionMode: 'default',
      message: { attachments: [], messageId: 'message-1', role: 'user', text: 'Build it' },
      runtimeMode: 'full-access',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'thread.turn.start',
    }),
  )
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
  // realpath, because macOS hands out /var/... and the containment checks
  // resolve to /private/var/... — a worktree inside the repo then reads as
  // outside the workspace and the branch never lands.
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'platform-branch-')))
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
