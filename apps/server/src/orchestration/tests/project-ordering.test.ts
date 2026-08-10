import { Database } from 'bun:sqlite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { orderKeyBetween, sortByOrderKey } from '@workspace/contracts'
import { migrateOrchestrationDatabase } from '../../db/migrations'
import * as schema from '../../db/schema'
import { projectionProjects } from '../../db/schema'
import { OrchestrationEngine } from '../engine'
import { ProjectionShellRowReader } from '../shell-row-reader'
import {
  clientOrchestrationCommandSchema,
  orchestrationCommandSchema,
  type OrchestrationCommand,
} from '../schemas'

const fixtures: Array<{ close: () => void }> = []
let commandCounter = 0

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.close()
  commandCounter = 0
})

describe('project reorder', () => {
  it('persists the key and carries it on the shell snapshot', async () => {
    const { database, engine } = await createEngineWithProjects(['project-1'])

    await engine.dispatch(reorderCommand('project-1', 'm'))

    expect(projectRow(database, 'project-1').orderKey).toBe('m')
    expect(engine.shellSnapshot().projects).toEqual([expect.objectContaining({ orderKey: 'm' })])
  })

  it('carries the key on the shell stream delta, not only on the snapshot', async () => {
    const { database, engine } = await createEngineWithProjects(['project-1'])

    await engine.dispatch(reorderCommand('project-1', 'm'))

    // The delta path reads one row per changed aggregate instead of the whole
    // snapshot, so it is the one that silently drops a newly added field.
    expect(new ProjectionShellRowReader(database).projectShell('project-1')).toMatchObject({
      orderKey: 'm',
    })
  })

  it('leaves a project the user never dragged without a key', async () => {
    const { engine } = await createEngineWithProjects(['project-1'])

    expect(engine.shellSnapshot().projects).toEqual([expect.objectContaining({ orderKey: null })])
  })

  it('refuses a reorder for a project that does not exist', async () => {
    const { engine } = await createEngineWithProjects(['project-1'])

    await expect(engine.dispatch(reorderCommand('project-missing', 'm'))).rejects.toMatchObject({
      code: 'orchestration.PROJECT_NOT_FOUND',
      status: 404,
    })
  })

  it('refuses a reorder that raced the delete of its project', async () => {
    const { engine } = await createEngineWithProjects(['project-1'])
    await engine.dispatch(command({ projectId: 'project-1', type: 'project.delete' }))

    await expect(engine.dispatch(reorderCommand('project-1', 'm'))).rejects.toMatchObject({
      code: 'orchestration.PROJECT_NOT_FOUND',
      status: 404,
    })
  })

  it('refuses a malformed key instead of persisting a row that sorts wrong', async () => {
    const { database, engine } = await createEngineWithProjects(['project-1'])

    // Bypasses the wire schema the way an internal dispatch would: the decider
    // is the guard that has to hold, because a persisted bad key is permanent.
    await expect(
      engine.dispatch({
        commandId: 'cmd-malformed',
        orderKey: 'Ba',
        projectId: 'project-1',
        type: 'project.reorder',
      } as unknown as OrchestrationCommand),
    ).rejects.toMatchObject({ code: 'orchestration.ORDER_KEY_INVALID', status: 400 })
    expect(projectRow(database, 'project-1').orderKey).toBeNull()
  })

  it('refuses a malformed key at the wire schema too', () => {
    expect(() =>
      v.parse(clientOrchestrationCommandSchema, {
        commandId: 'cmd-1',
        orderKey: 'ba',
        projectId: 'project-1',
        type: 'project.reorder',
      }),
    ).toThrow()
  })

  it('lands two interleaved drags on one deterministic order', async () => {
    const { database, engine } = await createEngineWithProjects([
      'project-1',
      'project-2',
      'project-3',
    ])
    await engine.dispatch(reorderCommand('project-1', 'b'))
    await engine.dispatch(reorderCommand('project-2', 'd'))
    await engine.dispatch(reorderCommand('project-3', 'f'))

    // Two drags planned against the SAME view of the list, applied one after
    // the other: each writes one key to one row, so neither can clobber the
    // other's slot and the result does not depend on the interleaving.
    const between = orderKeyBetween('b', 'd')
    const top = orderKeyBetween(null, 'b')
    await engine.dispatch(reorderCommand('project-3', between!))
    await engine.dispatch(reorderCommand('project-2', top!))

    expect(arrangedProjectIds(database)).toEqual(['project-2', 'project-1', 'project-3'])
    expect(engine.shellSnapshot().projects.map((project) => project.orderKey)).toEqual(
      expect.arrayContaining([top, 'b', between]),
    )
  })
})

type TestDatabase = ReturnType<typeof drizzle<typeof schema>>

/** The project list as the client renders it: keys compared as plain strings. */
function arrangedProjectIds(database: TestDatabase) {
  const rows = database
    .select()
    .from(projectionProjects)
    .all()
    .map((row) => ({ createdAt: row.createdAt, id: row.projectId, orderKey: row.orderKey }))

  return sortByOrderKey(rows).map((row) => row.id)
}

function projectRow(database: TestDatabase, projectId: string) {
  return database
    .select()
    .from(projectionProjects)
    .where(eq(projectionProjects.projectId, projectId))
    .get()!
}

function reorderCommand(projectId: string, orderKey: string) {
  return command({ orderKey, projectId, type: 'project.reorder' })
}

/** Every command needs its own id; the engine dedupes by receipt otherwise. */
function command(value: Record<string, unknown>) {
  commandCounter += 1

  return v.parse(orchestrationCommandSchema, {
    commandId: `cmd-${commandCounter}`,
    ...value,
  }) as OrchestrationCommand
}

async function createEngineWithProjects(projectIds: readonly string[]) {
  const sqlite = new Database(':memory:', { create: true })
  const database = drizzle({ client: sqlite, schema })
  migrateOrchestrationDatabase(database)
  fixtures.push({ close: () => sqlite.close() })
  const engine = new OrchestrationEngine(database)

  for (const projectId of projectIds) {
    await engine.dispatch(
      command({
        defaultModelSelection: null,
        projectId,
        title: projectId,
        type: 'project.create',
        workspaceRoot: `/workspace/${projectId}`,
      }),
    )
  }

  return { database, engine }
}
