import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { commandIdSchema } from '@workspace/contracts'
import { DOMAIN_AT, DOMAIN_IDS, DOMAIN_MODEL } from './factories/session-domain'
import {
  createDomainEngine,
  createEngineWithSession,
  domainCommand as command,
  projectRegistrationCommand,
  sessionCreateCommand,
} from './factories/engine'

const clientTimestamp = '1999-01-01T00:00:00.000Z'
const secondSessionId = 'd0000000-0000-4000-8000-000000000002'

describe('decider invariants', () => {
  it('rejects commands for a session that never existed', async () => {
    const { engine } = createDomainEngine()
    await expect(engine.dispatch(archiveCommand())).rejects.toMatchObject({
      code: 'orchestration.SESSION_NOT_FOUND',
      status: 404,
    })
    expect((await engine.replay({ afterSequence: 0 })).events).toHaveLength(0)
  })

  it('rejects a deleted session command without appending a dropped event', async () => {
    const engine = await createEngineWithSession()
    await engine.dispatch(
      command({ commandId: 'delete', sessionId: DOMAIN_IDS.session, type: 'session.delete' }),
    )
    await engine.providerRuntimeIdle()
    await expect(
      engine.dispatch(
        command({
          commandId: 'runtime-mode',
          sessionId: DOMAIN_IDS.session,
          type: 'session.runtime-mode.set',
          runtimeMode: 'approval-required',
        }),
      ),
    ).rejects.toMatchObject({ code: 'orchestration.SESSION_NOT_FOUND' })
    expect((await engine.replay({ afterSequence: 0 })).events.map((event) => event.type)).toEqual([
      'project.created',
      'worktree.registered',
      'session.created',
      'session.deleted',
      'session.deletion-updated',
    ])
  })

  it('rejects provider commands for a deleted session', async () => {
    const engine = await createEngineWithSession()
    await engine.dispatch(
      command({ commandId: 'delete', sessionId: DOMAIN_IDS.session, type: 'session.delete' }),
    )
    await engine.providerRuntimeIdle()
    const deletionSequence = (await engine.shellSnapshot()).snapshotSequence
    await expect(
      engine.dispatch(
        command({
          commandId: 'assistant-delta',
          createdAt: clientTimestamp,
          delta: 'orphaned',
          messageId: 'message-1',
          sessionId: DOMAIN_IDS.session,
          type: 'session.message.assistant.delta',
        }),
      ),
    ).rejects.toMatchObject({ code: 'orchestration.SESSION_NOT_FOUND' })
    expect((await engine.replay({ afterSequence: deletionSequence })).events).toEqual([])
  })

  it('rejects work and repeated archive commands for an archived session', async () => {
    const engine = await createEngineWithSession()
    await engine.dispatch(archiveCommand())
    await expect(engine.dispatch(turnStartCommand())).rejects.toMatchObject({
      code: 'orchestration.SESSION_ARCHIVED',
      status: 409,
    })
    await expect(engine.dispatch(archiveCommand('archive-again'))).rejects.toMatchObject({
      code: 'orchestration.SESSION_ARCHIVED',
    })
  })

  it('rejects unarchiving a session that is not archived', async () => {
    const engine = await createEngineWithSession()
    await expect(
      engine.dispatch(
        command({
          commandId: 'unarchive',
          sessionId: DOMAIN_IDS.session,
          type: 'session.unarchive',
        }),
      ),
    ).rejects.toMatchObject({ code: 'orchestration.SESSION_NOT_ARCHIVED', status: 409 })
  })

  it('rejects a bootstrap turn when its worktree does not exist', async () => {
    const { engine } = createDomainEngine()
    await expect(engine.dispatch(turnStartCommand(true))).rejects.toMatchObject({
      code: 'orchestration.WORKTREE_NOT_FOUND',
    })
    expect((await engine.replay({ afterSequence: 0 })).events).toHaveLength(0)
  })
})

describe('project delete cascade', () => {
  it('tombstones every live session and retires its worktrees in the same batch', async () => {
    const engine = await createEngineWithSession()
    await engine.dispatch(sessionCreateCommand(secondSessionId, 'session-create-2'))
    await engine.dispatch(projectDeleteCommand(true))
    const model = await engine.readModelSnapshot()
    expect(model.sessions.get(DOMAIN_IDS.session)?.deletedAt).not.toBeNull()
    expect(model.sessions.get(secondSessionId)?.deletedAt).not.toBeNull()
    expect(model.worktrees.get(DOMAIN_IDS.worktree)?.retiredAt).not.toBeNull()
    const events = (await engine.replay({ afterSequence: 0 })).events.filter(
      (event) => event.commandId === 'project-delete',
    )
    expect(events.map((event) => event.type)).toEqual([
      'session.deleted',
      'session.deleted',
      'worktree.retired',
      'project.deleted',
    ])
  })

  it('files cascaded events under their owning aggregates', async () => {
    const engine = await createEngineWithSession()
    await engine.dispatch(projectDeleteCommand(true))
    const events = (await engine.replay({ afterSequence: 0 })).events
    expect(events.filter((event) => event.type === 'session.deleted')).toMatchObject([
      { aggregateId: DOMAIN_IDS.session, aggregateKind: 'session' },
    ])
    expect(events.find((event) => event.type === 'worktree.retired')).toMatchObject({
      aggregateId: DOMAIN_IDS.worktree,
      aggregateKind: 'worktree',
    })
  })

  it('refuses to delete a project with live sessions without force', async () => {
    const engine = await createEngineWithSession()
    await expect(engine.dispatch(projectDeleteCommand())).rejects.toMatchObject({
      code: 'orchestration.PROJECT_NOT_EMPTY',
      status: 409,
    })
    expect((await engine.sessionDetailSnapshot(DOMAIN_IDS.session)).session.deletedAt).toBeNull()
  })

  it('deletes an empty project and rejects a second delete', async () => {
    const { engine } = createDomainEngine()
    await engine.dispatch(projectRegistrationCommand())
    await engine.dispatch(projectDeleteCommand())
    await expect(
      engine.dispatch(projectDeleteCommand(false, 'delete-again')),
    ).rejects.toMatchObject({ code: 'orchestration.PROJECT_NOT_FOUND' })
  })
})

describe('server-clock timestamps', () => {
  it('ignores client-supplied timestamps on session creation', async () => {
    const { engine } = createDomainEngine()
    await engine.dispatch(projectRegistrationCommand())
    const before = new Date().toISOString()
    await engine.dispatch(command({ ...sessionCreateCommand(), createdAt: clientTimestamp }))
    const created = (await engine.replay({ afterSequence: 2 })).events[0]!
    expect(created.occurredAt >= before).toBe(true)
    expect(created.payload).toMatchObject({ createdAt: created.occurredAt })
    expect(JSON.stringify(created)).not.toContain(clientTimestamp)
  })

  it('stamps one instant across a multi-event decision', async () => {
    const engine = await createEngineWithSession()
    await engine.dispatch(sessionCreateCommand(secondSessionId, 'session-create-2'))
    await engine.dispatch(projectDeleteCommand(true))
    const events = (await engine.replay({ afterSequence: 0 })).events.filter(
      (event) => event.commandId === 'project-delete',
    )
    expect(events).toHaveLength(4)
    expect(new Set(events.map((event) => event.occurredAt)).size).toBe(1)
  })
})

describe('worktree metadata ownership', () => {
  it('updates the shared worktree branch without copying it onto a session', async () => {
    const engine = await createEngineWithSession()
    await engine.dispatch(
      command({
        type: 'worktree.meta.update',
        commandId: 'branch',
        worktreeId: DOMAIN_IDS.worktree,
        branch: 'feature/next',
        updatedAt: DOMAIN_AT,
      }),
    )
    const snapshot = await engine.shellSnapshot()
    expect(snapshot.worktrees[0]?.branch).toBe('feature/next')
    expect(snapshot.sessions[0]).not.toHaveProperty('branch')
    expect(snapshot.sessions[0]?.worktreeId).toBe(DOMAIN_IDS.worktree)
  })

  it('makes repeated branch observations a durable no-op', async () => {
    const engine = await createEngineWithSession()
    const receipt = await engine.dispatch(
      command({
        type: 'worktree.meta.update',
        commandId: 'same-branch',
        worktreeId: DOMAIN_IDS.worktree,
        branch: null,
        updatedAt: DOMAIN_AT,
      }),
    )
    expect(receipt).toMatchObject({ sequence: 3, result: null })
    expect((await engine.replay({ afterSequence: 3 })).events).toEqual([])
  })

  it('renames a session without changing its worktree metadata', async () => {
    const engine = await createEngineWithSession()
    await engine.dispatch(
      command({
        commandId: 'rename',
        sessionId: DOMAIN_IDS.session,
        title: 'Renamed',
        type: 'session.meta.update',
      }),
    )
    expect((await engine.sessionDetailSnapshot(DOMAIN_IDS.session)).session.title).toBe('Renamed')
    expect((await engine.shellSnapshot()).worktrees[0]?.branch).toBeNull()
  })
})

describe('prepared repository registration', () => {
  it('reuses an active repository and worktree without appending events', async () => {
    const { engine } = createDomainEngine()
    await engine.dispatch(projectRegistrationCommand())
    const receipt = await engine.dispatch(
      projectRegistrationCommand(1, { commandId: v.parse(commandIdSchema, 'register-again') }),
    )
    expect(receipt).toMatchObject({
      sequence: 2,
      result: {
        projectId: DOMAIN_IDS.project,
        worktreeId: DOMAIN_IDS.worktree,
        disposition: 'existing-worktree',
      },
    })
    expect((await engine.replay({ afterSequence: 0 })).events).toHaveLength(2)
  })

  it('revives an empty repository with its original identities', async () => {
    const { engine } = createDomainEngine()
    await engine.dispatch(projectRegistrationCommand())
    await engine.dispatch(projectDeleteCommand())
    await engine.dispatch(
      projectRegistrationCommand(1, { commandId: v.parse(commandIdSchema, 'revive') }),
    )
    const snapshot = await engine.shellSnapshot()
    expect(snapshot.projects[0]?.id).toBe(DOMAIN_IDS.project)
    expect(snapshot.worktrees[0]).toMatchObject({
      id: DOMAIN_IDS.worktree,
      registrationGeneration: 1,
    })
  })

  it('renames repository metadata while retaining its current worktree', async () => {
    const { engine } = createDomainEngine()
    await engine.dispatch(projectRegistrationCommand())
    await engine.dispatch(
      command({
        commandId: 'rename-project',
        projectId: DOMAIN_IDS.project,
        title: 'Renamed',
        type: 'project.meta.update',
      }),
    )
    const snapshot = await engine.shellSnapshot()
    expect(snapshot.projects[0]?.title).toBe('Renamed')
    expect(snapshot.worktrees[0]?.id).toBe(DOMAIN_IDS.worktree)
  })
})

function projectDeleteCommand(force = false, commandId = 'project-delete') {
  return command({ commandId, force, projectId: DOMAIN_IDS.project, type: 'project.delete' })
}

function archiveCommand(commandId = 'archive') {
  return command({ commandId, sessionId: DOMAIN_IDS.session, type: 'session.archive' })
}

function turnStartCommand(bootstrap = false) {
  return command({
    commandId: 'turn-start',
    type: 'session.turn.start',
    sessionId: DOMAIN_IDS.session,
    runtimeMode: 'full-access',
    interactionMode: 'default',
    turnId: 'turn-1',
    message: { messageId: 'message-1', role: 'user', text: 'Build the first slice' },
    bootstrap: bootstrap
      ? {
          createSession: {
            worktreeId: DOMAIN_IDS.worktree,
            title: 'Session',
            modelSelection: DOMAIN_MODEL,
            runtimeMode: 'full-access',
            interactionMode: 'default',
          },
        }
      : undefined,
  })
}
