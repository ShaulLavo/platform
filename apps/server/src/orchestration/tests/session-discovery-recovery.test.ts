import { mkdir, symlink } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { providerInstanceIdSchema, sessionIdSchema } from '@workspace/contracts'
import { SessionDiscoveryReconciler } from '../session-discovery'
import { discoveryFixture } from './factories/discovery'
import type { ProviderDiscoveredSession } from '../../provider/types'

const instance = v.parse(providerInstanceIdSchema, 'claude-work')
const otherInstance = v.parse(providerInstanceIdSchema, 'claude-other')
const sessionId = v.parse(sessionIdSchema, '19ccf3c8-d1a9-4ae5-a2d4-456b9a772df3')
const sourceUpdatedAt = '2026-09-05T00:00:00.000Z'

function metadata(cwd: string | null): ProviderDiscoveredSession {
  return { sessionId, cwd, title: 'CLI session', sourceUpdatedAt, gitBranch: null }
}

describe('session discovery reconciliation', () => {
  it('imports once, refreshes changed metadata, and keeps deleted and cross-account identities closed', async () => {
    const fixture = await discoveryFixture()
    let row = metadata(fixture.main)
    let providerInstanceId = instance
    const reconciler = new SessionDiscoveryReconciler({
      ...fixture,
      dispatch: (command) => fixture.engine.dispatch(command),
      providerService: {
        discoveryInstances: () => [providerInstanceId],
        discoverSessions: async () => [row],
      },
    })
    try {
      await fixture.register()
      expect(await reconciler.scan()).toMatchObject({ imported: 1 })
      const first = await fixture.engine.shellSnapshot()
      expect(first.sessions).toHaveLength(1)
      expect(first.sessions[0]).toMatchObject({
        id: sessionId,
        title: 'CLI session',
        origin: 'discovered',
        runtime: null,
      })
      expect(await reconciler.scan()).toMatchObject({ imported: 0 })
      expect((await fixture.engine.shellSnapshot()).snapshotSequence).toBe(first.snapshotSequence)
      row = { ...row, title: 'Renamed in CLI', sourceUpdatedAt: '2026-09-05T01:00:00.000Z' }
      await reconciler.scan()
      expect((await fixture.engine.shellSnapshot()).sessions[0]?.title).toBe('Renamed in CLI')
      providerInstanceId = otherInstance
      expect(await reconciler.scan()).toMatchObject({
        skipped: { 'provider-instance-conflict': 1 },
      })
      providerInstanceId = instance
      await fixture.engine.dispatchClientCommand({
        type: 'session.delete',
        commandId: 'delete-discovered',
        sessionId,
      })
      expect(await reconciler.scan()).toMatchObject({ skipped: { 'deleted-session': 1 } })
      expect((await fixture.engine.shellSnapshot()).sessions).toEqual([])
    } finally {
      await reconciler.close()
      await fixture.close()
    }
  })

  it('canonicalizes cwd, chooses the nested registered checkout, and refuses reparenting or unknown directories', async () => {
    const fixture = await discoveryFixture()
    const nested = path.join(fixture.main, 'nested')
    const alias = path.join(fixture.root, 'alias')
    await mkdir(nested)
    await symlink(nested, alias)
    let row = metadata(alias)
    const reconciler = new SessionDiscoveryReconciler({
      ...fixture,
      dispatch: (command) => fixture.engine.dispatch(command),
      providerService: {
        discoveryInstances: () => [instance],
        discoverSessions: async () => [row],
      },
    })
    try {
      await fixture.register()
      const nestedRegistration = await fixture.register(nested)
      await reconciler.scan()
      expect((await fixture.engine.shellSnapshot()).sessions[0]?.worktreeId).toBe(
        nestedRegistration.result?.worktreeId,
      )
      row = metadata(fixture.main)
      expect(await reconciler.scan()).toMatchObject({ skipped: { 'session-reparent-conflict': 1 } })
      row = metadata(null)
      expect(await reconciler.scan()).toMatchObject({ skipped: { 'missing-cwd': 1 } })
      row = metadata(fixture.root)
      expect(await reconciler.scan()).toMatchObject({ skipped: { 'unknown-cwd': 1 } })
    } finally {
      await reconciler.close()
      await fixture.close()
    }
  })

  it('verifies an external Git worktree before registering it and converges repeated scans', async () => {
    const fixture = await discoveryFixture()
    const linked = path.join(fixture.root, 'linked')
    const reconciler = new SessionDiscoveryReconciler({
      ...fixture,
      dispatch: (command) => fixture.engine.dispatch(command),
      providerService: {
        discoveryInstances: () => [instance],
        discoverSessions: async () => [metadata(linked)],
      },
    })
    try {
      await fixture.initializeGit()
      await fixture.git('worktree', 'add', '-b', 'feature', linked)
      await fixture.register()
      expect(await reconciler.scan()).toMatchObject({ imported: 1, skipped: {} })
      const first = await fixture.engine.shellSnapshot()
      expect(first.worktrees).toHaveLength(2)
      const worktree = first.worktrees.find((entry) => entry.canonicalPath === linked)
      expect(worktree).toMatchObject({ kind: 'linked', ownership: 'external', branch: 'feature' })
      expect(first.sessions[0]?.worktreeId).toBe(worktree?.id)
      await reconciler.scan()
      expect((await fixture.engine.shellSnapshot()).snapshotSequence).toBe(first.snapshotSequence)
    } finally {
      await reconciler.close()
      await fixture.close()
    }
  })
})
