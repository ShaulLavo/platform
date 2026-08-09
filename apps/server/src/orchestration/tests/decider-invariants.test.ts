import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import * as v from 'valibot'
import * as schema from '../../db/schema'
import { migrateOrchestrationDatabase } from '../../db/migrations'
import { OrchestrationEngine } from '../engine'
import { orchestrationCommandSchema, type OrchestrationCommand } from '../schemas'

const modelSelection = { model: 'gpt-5-codex', providerInstanceId: 'codex' }
const clientTimestamp = '1999-01-01T00:00:00.000Z'
const fixtures: Array<{ close: () => void }> = []

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.close()
})

describe('decider invariants', () => {
  it('rejects thread commands for a thread that never existed', async () => {
    const engine = createEngine()

    await expect(engine.dispatch(threadArchiveCommand())).rejects.toMatchObject({
      code: 'orchestration.THREAD_NOT_FOUND',
      status: 404,
    })
    expect(engine.replay({ afterSequence: 0 }).events).toHaveLength(0)
  })

  it('rejects thread commands for a deleted thread instead of appending a dropped event', async () => {
    const engine = await createEngineWithThread()

    await engine.dispatch(
      command({ commandId: 'cmd-thread-delete', threadId: 'thread-1', type: 'thread.delete' }),
    )

    await expect(
      engine.dispatch(
        command({
          commandId: 'cmd-runtime-mode',
          runtimeMode: 'approval-required',
          threadId: 'thread-1',
          type: 'thread.runtime-mode.set',
        }),
      ),
    ).rejects.toMatchObject({ code: 'orchestration.THREAD_NOT_FOUND' })

    const types = engine.replay({ afterSequence: 0 }).events.map((event) => event.type)
    expect(types).toEqual(['project.created', 'thread.created', 'thread.deleted'])
  })

  it('rejects provider-runtime commands for a deleted thread', async () => {
    const engine = await createEngineWithThread()

    await engine.dispatch(
      command({ commandId: 'cmd-thread-delete', threadId: 'thread-1', type: 'thread.delete' }),
    )

    await expect(
      engine.dispatch(
        command({
          commandId: 'cmd-assistant-delta',
          createdAt: clientTimestamp,
          delta: 'orphaned',
          messageId: 'message-1',
          threadId: 'thread-1',
          type: 'thread.message.assistant.delta',
        }),
      ),
    ).rejects.toMatchObject({ code: 'orchestration.THREAD_NOT_FOUND' })
    expect(engine.replay({ afterSequence: 0 }).events).toHaveLength(3)
  })

  it('rejects work commands for an archived thread', async () => {
    const engine = await createEngineWithThread()

    await engine.dispatch(threadArchiveCommand())

    await expect(engine.dispatch(threadTurnStartCommand())).rejects.toMatchObject({
      code: 'orchestration.THREAD_ARCHIVED',
      status: 409,
    })
    await expect(engine.dispatch(threadArchiveCommand('cmd-archive-again'))).rejects.toMatchObject({
      code: 'orchestration.THREAD_ARCHIVED',
    })
  })

  it('rejects unarchiving a thread that is not archived', async () => {
    const engine = await createEngineWithThread()

    await expect(
      engine.dispatch(
        command({ commandId: 'cmd-unarchive', threadId: 'thread-1', type: 'thread.unarchive' }),
      ),
    ).rejects.toMatchObject({ code: 'orchestration.THREAD_NOT_ARCHIVED', status: 409 })
  })

  it('rejects a turn start for a project that does not exist', async () => {
    const engine = createEngine()

    await expect(
      engine.dispatch(threadTurnStartCommand({ bootstrap: true })),
    ).rejects.toMatchObject({ code: 'orchestration.PROJECT_NOT_FOUND' })
    expect(engine.replay({ afterSequence: 0 }).events).toHaveLength(0)
  })
})

describe('project delete cascade', () => {
  it('marks every live thread deleted in the same batch', async () => {
    const engine = await createEngineWithThread()
    await engine.dispatch(threadCreateCommand('thread-2', 'cmd-thread-create-2'))

    await engine.dispatch(projectDeleteCommand({ force: true }))

    const detail = engine.threadDetailSnapshot('thread-1')
    const other = engine.threadDetailSnapshot('thread-2')
    expect(detail.thread.deletedAt).not.toBeNull()
    expect(other.thread.deletedAt).not.toBeNull()
    expect(engine.replay({ afterSequence: 0 }).events.map((event) => event.type)).toEqual([
      'project.created',
      'thread.created',
      'thread.created',
      'thread.deleted',
      'thread.deleted',
      'project.deleted',
    ])
  })

  it('files the cascaded thread events under their own aggregate', async () => {
    const engine = await createEngineWithThread()

    await engine.dispatch(projectDeleteCommand({ force: true }))

    const cascaded = engine
      .replay({ afterSequence: 0 })
      .events.filter((event) => event.type === 'thread.deleted')
    expect(cascaded).toHaveLength(1)
    expect(cascaded[0]).toMatchObject({ aggregateId: 'thread-1', aggregateKind: 'thread' })
  })

  it('refuses to delete a project that still has live threads without force', async () => {
    const engine = await createEngineWithThread()

    await expect(engine.dispatch(projectDeleteCommand())).rejects.toMatchObject({
      code: 'orchestration.PROJECT_NOT_EMPTY',
      status: 409,
    })
    expect(engine.threadDetailSnapshot('thread-1').thread.deletedAt).toBeNull()
  })

  it('deletes an empty project without force and rejects a second delete', async () => {
    const engine = createEngine()
    await engine.dispatch(projectCreateCommand())

    await engine.dispatch(projectDeleteCommand())

    await expect(
      engine.dispatch(projectDeleteCommand({ commandId: 'cmd-project-delete-2' })),
    ).rejects.toMatchObject({ code: 'orchestration.PROJECT_NOT_FOUND' })
  })
})

describe('server-clock timestamps', () => {
  it('ignores a client-supplied timestamp on every event and payload', async () => {
    const engine = createEngine()
    const before = new Date().toISOString()

    await engine.dispatch(
      command({
        commandId: 'cmd-project-create',
        createdAt: clientTimestamp,
        defaultModelSelection: null,
        projectId: 'project-1',
        title: 'Platform',
        type: 'project.create',
        workspaceRoot: '/workspace',
      }),
    )

    const created = engine.replay({ afterSequence: 0 }).events[0]
    expect(created?.occurredAt >= before).toBe(true)
    expect(created?.payload).toMatchObject({ createdAt: created?.occurredAt })
    expect(JSON.stringify(created)).not.toContain(clientTimestamp)
  })

  it('stamps one instant across a multi-event decision', async () => {
    const engine = await createEngineWithThread()
    await engine.dispatch(threadCreateCommand('thread-2', 'cmd-thread-create-2'))

    await engine.dispatch(projectDeleteCommand({ force: true }))

    const cascade = engine
      .replay({ afterSequence: 0 })
      .events.filter((event) => event.commandId === 'cmd-project-delete')
    expect(new Set(cascade.map((event) => event.occurredAt)).size).toBe(1)
  })
})

describe('thread.meta.update compare-and-swap', () => {
  it('applies the update when expectedBranch still matches', async () => {
    const engine = await createEngineWithThread()

    await engine.dispatch(
      command({
        branch: 'feature/next',
        commandId: 'cmd-meta-update',
        expectedBranch: null,
        threadId: 'thread-1',
        type: 'thread.meta.update',
      }),
    )

    expect(engine.threadDetailSnapshot('thread-1').thread.branch).toBe('feature/next')
  })

  it('refuses a stale expectedBranch', async () => {
    const engine = await createEngineWithThread()
    await engine.dispatch(
      command({
        branch: 'feature/next',
        commandId: 'cmd-meta-update',
        threadId: 'thread-1',
        type: 'thread.meta.update',
      }),
    )

    await expect(
      engine.dispatch(
        command({
          branch: 'feature/other',
          commandId: 'cmd-meta-update-stale',
          expectedBranch: null,
          threadId: 'thread-1',
          type: 'thread.meta.update',
        }),
      ),
    ).rejects.toMatchObject({ code: 'orchestration.THREAD_BRANCH_CONFLICT', status: 409 })
    expect(engine.threadDetailSnapshot('thread-1').thread.branch).toBe('feature/next')
  })

  it('leaves the branch unchecked when expectedBranch is omitted', async () => {
    const engine = await createEngineWithThread()

    await engine.dispatch(
      command({
        commandId: 'cmd-meta-update',
        threadId: 'thread-1',
        title: 'Renamed',
        type: 'thread.meta.update',
      }),
    )

    expect(engine.threadDetailSnapshot('thread-1').thread.title).toBe('Renamed')
  })
})

describe('workspace root uniqueness', () => {
  it('refuses a second active project on the same normalized workspace root', async () => {
    const engine = createEngine()
    await engine.dispatch(projectCreateCommand())

    await expect(
      engine.dispatch(
        projectCreateCommand({
          commandId: 'cmd-project-create-2',
          projectId: 'project-2',
          workspaceRoot: '/workspace/',
        }),
      ),
    ).rejects.toMatchObject({ code: 'orchestration.PROJECT_WORKSPACE_ROOT_TAKEN', status: 409 })
  })

  it('frees the workspace root once the holding project is deleted', async () => {
    const engine = createEngine()
    await engine.dispatch(projectCreateCommand())
    await engine.dispatch(projectDeleteCommand())

    await engine.dispatch(
      projectCreateCommand({ commandId: 'cmd-project-create-2', projectId: 'project-2' }),
    )

    expect(engine.shellSnapshot().projects.map((project) => project.id)).toContain('project-2')
  })

  it('lets a project keep its own workspace root through a meta update', async () => {
    const engine = createEngine()
    await engine.dispatch(projectCreateCommand())

    await engine.dispatch(
      command({
        commandId: 'cmd-project-meta',
        projectId: 'project-1',
        title: 'Renamed',
        type: 'project.meta.update',
        workspaceRoot: '/workspace',
      }),
    )

    expect(engine.shellSnapshot().projects[0]).toMatchObject({ title: 'Renamed' })
  })
})

function projectCreateCommand(
  input: { commandId?: string; projectId?: string; workspaceRoot?: string } = {},
) {
  return command({
    commandId: input.commandId ?? 'cmd-project-create',
    createdAt: clientTimestamp,
    defaultModelSelection: null,
    projectId: input.projectId ?? 'project-1',
    title: 'Platform',
    type: 'project.create',
    workspaceRoot: input.workspaceRoot ?? '/workspace',
  })
}

function projectDeleteCommand(input: { commandId?: string; force?: boolean } = {}) {
  return command({
    commandId: input.commandId ?? 'cmd-project-delete',
    force: input.force ?? false,
    projectId: 'project-1',
    type: 'project.delete',
  })
}

function threadCreateCommand(threadId = 'thread-1', commandId = 'cmd-thread-create') {
  return command({
    branch: null,
    commandId,
    interactionMode: 'default',
    modelSelection,
    projectId: 'project-1',
    runtimeMode: 'full-access',
    threadId,
    title: 'Phase 2',
    type: 'thread.create',
    worktreePath: null,
  })
}

function threadArchiveCommand(commandId = 'cmd-thread-archive') {
  return command({ commandId, threadId: 'thread-1', type: 'thread.archive' })
}

function threadTurnStartCommand(input: { bootstrap?: boolean } = {}) {
  return command({
    bootstrap: input.bootstrap
      ? {
          createThread: {
            branch: null,
            interactionMode: 'default',
            modelSelection,
            projectId: 'project-1',
            runtimeMode: 'full-access',
            title: 'Phase 2',
            worktreePath: null,
          },
        }
      : undefined,
    commandId: 'cmd-turn-start',
    interactionMode: 'default',
    message: { messageId: 'message-1', role: 'user', text: 'Build the first slice' },
    runtimeMode: 'full-access',
    threadId: 'thread-1',
    turnId: 'turn-1',
    type: 'thread.turn.start',
  })
}

function command(value: unknown) {
  return v.parse(orchestrationCommandSchema, value) as OrchestrationCommand
}

function createEngine() {
  const sqlite = new Database(':memory:', { create: true })
  const database = drizzle({ client: sqlite, schema })
  migrateOrchestrationDatabase(database)
  fixtures.push({ close: () => sqlite.close() })

  return new OrchestrationEngine(database)
}

async function createEngineWithThread() {
  const engine = createEngine()
  await engine.dispatch(projectCreateCommand())
  await engine.dispatch(threadCreateCommand())

  return engine
}
