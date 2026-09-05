import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { healthDescriptorSchema } from '@workspace/contracts'
import { afterEach, expect, it } from 'vitest'
import * as v from 'valibot'
import { closeTestApps, createTestApp } from '../../../test/server'
import { createInProcessOrchestrationSocket } from '../../../test/orchestration-socket'
import { testSettingsOptions } from '../../settings/testing'

const origin = 'http://localhost:5173'
const roots: string[] = []

afterEach(async () => {
  await closeTestApps()
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })))
})

it('carries the same durable identity in health, the handshake, and serverConfig requests', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-ws-identity-'))
  roots.push(root)
  const app = createTestApp({
    workspaceRoot: root,
    settings: testSettingsOptions(root),
    watch: false,
  })
  const response = await app.handle(new Request('http://local/health', { headers: { origin } }))
  const descriptor = v.parse(healthDescriptorSchema, await response.json())
  const socket = createInProcessOrchestrationSocket(app, origin)

  expect(socket.closes).toEqual([])
  expect(socket.messages[0]).toMatchObject({
    kind: 'connected',
    config: { environmentId: descriptor.environmentId, protocolVersion: 5 },
  })

  socket.receive({ kind: 'request', method: 'serverConfig', requestId: 'config-request' })
  await expect.poll(() => socket.messages.length).toBe(2)
  expect(socket.messages[1]).toMatchObject({
    kind: 'response',
    ok: true,
    requestId: 'config-request',
    data: { environmentId: descriptor.environmentId, protocolVersion: 5 },
  })
})

it('closes rejected upgrades with 1008 and forwards the unauthorized reason', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-ws-auth-'))
  roots.push(root)
  const app = createTestApp({
    workspaceRoot: root,
    settings: testSettingsOptions(root),
    watch: false,
  })

  for (const untrustedOrigin of [undefined, 'http://evil.localhost']) {
    const socket = createInProcessOrchestrationSocket(app, untrustedOrigin)
    expect(socket.messages).toEqual([])
    expect(socket.closes).toEqual([{ code: 1008, reason: 'unauthorized' }])
    socket.receive({ kind: 'request', method: 'serverConfig', requestId: 'unauthorized-request' })
    expect(socket.messages).toEqual([])
  }
})

it('lets WS upgrades reach socket authentication while the descriptor keeps HTTP auth', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-ws-upgrade-'))
  roots.push(root)
  const app = createTestApp({
    workspaceRoot: root,
    settings: testSettingsOptions(root),
    watch: false,
  })

  for (const requestOrigin of [origin, 'http://evil.localhost']) {
    const upgrade = await app.handle(
      new Request('http://local/orchestration/rpc', {
        headers: { origin: requestOrigin, upgrade: 'websocket', connection: 'Upgrade' },
      }),
    )
    // In-process requests have no Bun socket to upgrade; this response proves the WS handler ran.
    expect(upgrade.status).toBe(400)
    expect(await upgrade.text()).toBe('Expected a websocket connection')
  }

  const descriptor = await app.handle(
    new Request('http://local/health', {
      headers: { origin: 'http://evil.localhost' },
    }),
  )
  expect(descriptor.status).toBe(403)
})
