import { expect } from 'vitest'
import { clientId, descriptorValue, fakeSsh, machine, test } from './fixtures'

test('launches, forwards, confirms identity and stops its managed record in order', async () => {
  const fixture = await fakeSsh()
  const result = await fixture.launcher.connectMachine('fixture')
  expect(result).toMatchObject({
    name: 'fixture',
    phase: 'live',
    localPort: 51078,
    origin: 'http://127.0.0.1:51078',
    descriptor: descriptorValue,
  })
  expect(fixture.phases.map((state) => state.phase)).toEqual(['launching', 'connecting', 'live'])
  expect(fixture.commands).toHaveLength(3)
  expect(fixture.commands[0]?.at(-1)).toContain('command -v bun')
  expect(fixture.commands[1]?.at(-1)).toContain('await withLeaseLock(launch);')
  expect(fixture.commands[2]).toContain('127.0.0.1:51078:127.0.0.1:31001')
  expect(
    fixture.commands.every(
      (command) =>
        command.includes('BatchMode=yes') && command.includes('StrictHostKeyChecking=yes'),
    ),
  ).toBe(true)
  await fixture.launcher.disconnectMachine('fixture')
  expect(fixture.forwardChildren[0]?.signalCode).not.toBeNull()
  expect(fixture.commands[3]?.at(-1)).toContain('await withLeaseLock(stop);')
  expect(fixture.events.map((event) => event.action)).toEqual([
    'desktop.ssh.connect',
    'desktop.ssh.disconnect',
  ])
  expect(fixture.events[0]?.fields).toMatchObject({
    machine: 'fixture',
    target: 'fixture',
    step: 'identity',
    outcome: 'success',
    managed: true,
  })
  expect(fixture.phases.at(-1)?.phase).toBe('idle')
})

test('reuses one connection for concurrent requests and retains its local endpoint on reconnect', async () => {
  const fixture = await fakeSsh({ kind: 'external' })
  const [first, same] = await Promise.all([
    fixture.launcher.connectMachine('fixture'),
    fixture.launcher.connectMachine('fixture'),
  ])
  expect(first).toEqual(same)
  expect(fixture.commands).toHaveLength(3)
  await fixture.launcher.disconnectMachine('fixture')
  await fixture.launcher.connectMachine('fixture')
  expect(fixture.requestedPorts).toEqual([undefined, 51078])
  expect(fixture.events[0]?.fields.managed).toBe(false)
})

test('refuses changed identities and closes the newly opened forward', async () => {
  const fixture = await fakeSsh()
  await fixture.launcher.connectMachine('fixture')
  await fixture.launcher.disconnectMachine('fixture')
  fixture.changeHealth({
    ...descriptorValue,
    environmentId: '00000000-0000-4000-8000-000000000079',
  })
  const result = await fixture.launcher.connectMachine('fixture')
  expect(result.phase).toBe('identity-drift')
  expect(fixture.forwardChildren.at(-1)?.signalCode).not.toBeNull()
  expect(fixture.events.at(-1)?.fields).toMatchObject({ step: 'identity', outcome: 'failed' })
})

test('reports SSH refusal without attempting a remote launch or cleanup', async () => {
  const fixture = await fakeSsh({ probeFails: true })
  const result = await fixture.launcher.connectMachine('fixture')
  expect(result).toMatchObject({
    phase: 'blocked',
    lastError: expect.stringContaining('Permission denied'),
  })
  expect(fixture.commands).toHaveLength(1)
})

test('publishes loss of an established forward without affecting the launcher process', async () => {
  const fixture = await fakeSsh()
  await fixture.launcher.connectMachine('fixture')
  fixture.forwardChildren[0]?.kill()
  await expect.poll(() => fixture.phases.at(-1)?.phase).toBe('offline')
  expect(fixture.events.at(-1)?.action).toBe('desktop.ssh.forward.exited')
  const retried = await fixture.launcher.connectMachine('fixture')
  expect(retried.phase).toBe('live')
  expect(
    fixture.commands.filter((command) => command.at(-1)?.includes('await withLeaseLock(stop);')),
  ).toHaveLength(0)
  expect(fixture.requestedPorts).toEqual([undefined, 51078])
})

test('relaunches a crashed managed server while its SSH forward is still alive', async () => {
  const fixture = await fakeSsh()
  await fixture.launcher.connectMachine('fixture')
  const previousForward = fixture.forwardChildren[0]
  fixture.crashServer()
  const retried = await fixture.launcher.connectMachine('fixture')
  expect(retried.phase).toBe('live')
  expect(previousForward?.signalCode).not.toBeNull()
  expect(
    fixture.commands.filter((command) => command.at(-1)?.includes('await withLeaseLock(launch);')),
  ).toHaveLength(2)
  expect(fixture.requestedPorts).toEqual([undefined, 51078])
  expect(
    fixture.commands.filter((command) => command.at(-1)?.includes('await withLeaseLock(stop);')),
  ).toHaveLength(0)
})

test('a healthy forwarded server survives a chat connection retry', async () => {
  const fixture = await fakeSsh()
  await fixture.launcher.connectMachine('fixture')
  const previousForward = fixture.forwardChildren[0]
  const retried = await fixture.launcher.connectMachine('fixture')
  expect(retried.phase).toBe('live')
  expect(previousForward?.signalCode).toBeNull()
  expect(fixture.commands).toHaveLength(3)
})

test('disconnect cancels a pending connect before it can publish live', async () => {
  const fixture = await fakeSsh({ slowProbe: true })
  const connect = fixture.launcher.connectMachine('fixture')
  await expect.poll(() => fixture.phases.length).toBeGreaterThan(0)
  await fixture.launcher.disconnectMachine('fixture')
  await connect
  expect(fixture.phases.at(-1)?.phase).toBe('idle')
  expect(fixture.phases.some((state) => state.phase === 'live')).toBe(false)
})

test('rejects invalid RPC names before spawning any process', async () => {
  const fixture = await fakeSsh()
  await expect(fixture.launcher.connectMachine('-oProxyCommand=bad')).rejects.toMatchObject({
    code: 'desktop.SSH_SETTINGS',
  })
  expect(fixture.commands).toHaveLength(0)
})

test('machine aliases use separate stable launch records and clean up independently', async () => {
  const fixture = await fakeSsh({ machines: { fixture: machine, alias: machine } })
  await Promise.all([
    fixture.launcher.connectMachine('fixture'),
    fixture.launcher.connectMachine('alias'),
  ])
  const launches = fixture.commands.filter((command) =>
    command.at(-1)?.includes('await withLeaseLock(launch);'),
  )
  expect(launches.some((command) => command.at(-1)?.includes(`${clientId}-fixture`))).toBe(true)
  expect(launches.some((command) => command.at(-1)?.includes(`${clientId}-alias`))).toBe(true)
  await fixture.launcher.disconnectMachine('fixture')
  const stop = fixture.commands.at(-1)?.at(-1)
  expect(stop).toContain(`${clientId}-fixture`)
  expect(stop).not.toContain(`${clientId}-alias`)
  expect(fixture.phases.filter((state) => state.name === 'alias').at(-1)?.phase).toBe('live')
})
