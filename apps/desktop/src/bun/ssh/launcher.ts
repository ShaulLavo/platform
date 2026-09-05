import type {
  EnvironmentId,
  HealthDescriptor,
  Machines,
  SshMachineDefinition,
} from '@workspace/contracts'
import type { PlatformMachineState } from '../../shared/bridge'
import { recordDesktopError, recordDesktopInfo } from '../observability'
import { createSshError, type SshErrorStep } from '../structured-errors'
import {
  closeForward,
  openForward,
  probeDescriptor,
  reserveForwardPort,
  runSshCommand,
  spawnSsh,
  waitForDescriptor,
  type SshChild,
  type SshSpawner,
} from './forward'
import {
  parseMachineName,
  parseMachineSettings,
  parseRemoteRecord,
  type RemoteRecord,
} from './records'
import { launchCommand, probeCommand, stopCommand } from './remote-scripts'

type Connection = {
  name: string
  machine: SshMachineDefinition | null
  controller: AbortController
  forward: SshChild | null
  record: RemoteRecord | null
  remoteAttempted: boolean
  preserveRemoteOnFailure: boolean
  state: PlatformMachineState
}

type ConnectEvent = {
  machine: string
  target?: string
  step: SshErrorStep
  steps: Partial<Record<SshErrorStep, number>>
  outcome: 'pending' | 'success' | 'failed' | 'cancelled'
  durationMs?: number
  environmentId?: EnvironmentId
  localPort?: number
  remotePort?: number
  managed?: boolean
  error?: string
  cleanupError?: string
}

type LauncherOptions = {
  clientId: string
  webOrigin: string
  readMachines: () => Promise<Machines>
  publish: (state: PlatformMachineState) => void
  spawn?: SshSpawner
  fetcher?: typeof fetch
  localPort?: (retainedPort?: number) => Promise<number>
  record?: (action: string, fields: Record<string, unknown>, failed: boolean) => void
}

export function createSshLauncher(options: LauncherOptions) {
  const connections = new Map<string, Connection>()
  const pending = new Map<string, Promise<PlatformMachineState>>()
  const disconnecting = new Map<string, Promise<void>>()
  const ports = new Map<string, number>()
  const identities = new Map<string, EnvironmentId>()
  const spawn = options.spawn ?? spawnSsh
  const writeLog = options.record ?? recordEvent
  let closing = false

  function publish(connection: Connection, state: PlatformMachineState) {
    connection.state = state
    options.publish(state)
  }

  async function connectMachine(input: string): Promise<PlatformMachineState> {
    const name = await parseMachineName(input)
    if (closing) throw createSshError('settings', 'The desktop app is closing.')
    await disconnecting.get(name)
    const running = pending.get(name)
    if (running) return running
    const operation = connect(name).finally(() => pending.delete(name))
    pending.set(name, operation)
    return operation
  }

  async function step<T>(event: ConnectEvent, name: SshErrorStep, action: () => Promise<T>) {
    event.step = name
    const startedAt = Date.now()
    try {
      return await action()
    } finally {
      event.steps[name] = Date.now() - startedAt
    }
  }

  async function connect(name: string): Promise<PlatformMachineState> {
    const previous = connections.get(name)
    if (closing) throw createSshError('settings', 'The desktop app is closing.')
    const event: ConnectEvent = { machine: name, step: 'settings', steps: {}, outcome: 'pending' }
    const startedAt = Date.now()
    let connection = previous ?? newConnection(name)
    try {
      if (previous && (await refreshLiveConnection(previous, event))) {
        event.outcome = 'success'
        return previous.state
      }
      if (closing) throw createSshError('settings', 'The desktop app is closing.')
      connection = newConnection(name, previous)
      connections.set(name, connection)
      publish(connection, connection.state)
      if (previous) await closeConnectionForward(previous)
      connection.controller.signal.throwIfAborted()
      const descriptor = await establish(connection, event)
      event.environmentId = descriptor.environmentId
      event.outcome = 'success'
      return connection.state
    } catch (error) {
      return await failed(connection, event, error)
    } finally {
      event.durationMs = Date.now() - startedAt
      writeLog('desktop.ssh.connect', event, event.outcome === 'failed')
    }
  }

  function newConnection(name: string, previous?: Connection): Connection {
    return {
      name,
      machine: previous?.machine ?? null,
      controller: new AbortController(),
      forward: null,
      record: previous?.record ?? null,
      remoteAttempted: previous?.remoteAttempted ?? false,
      preserveRemoteOnFailure: previous?.preserveRemoteOnFailure ?? false,
      state: { name, phase: 'launching' },
    }
  }

  async function refreshLiveConnection(connection: Connection, event: ConnectEvent) {
    const state = connection.state
    if (state.phase !== 'live' || !connection.forward) return false
    const descriptor = await step(event, 'readiness', () =>
      probeDescriptor({
        origin: state.origin,
        webOrigin: options.webOrigin,
        signal: connection.controller.signal,
        fetcher: options.fetcher ?? fetch,
      }),
    )
    connection.controller.signal.throwIfAborted()
    if (!descriptor || connection.state.phase !== 'live' || !connection.forward) return false
    if (connection.forward.exitCode !== null || connection.forward.signalCode !== null) return false
    await step(event, 'identity', async () => confirmIdentity(connection, descriptor))
    event.target = connection.machine?.target
    event.environmentId = descriptor.environmentId
    event.localPort = connection.state.localPort
    event.remotePort = connection.record?.port
    event.managed = connection.record?.kind === 'managed'
    publish(connection, { ...connection.state, descriptor })
    return true
  }

  async function establish(connection: Connection, event: ConnectEvent) {
    const machines = await step(event, 'settings', async () =>
      parseMachineSettings(await options.readMachines()),
    )
    const machine = machines[connection.name]
    if (!machine || machine.kind !== 'ssh')
      throw createSshError('settings', `No SSH machine named ${connection.name} exists.`)
    if (connection.machine && changedRemote(connection.machine, machine)) {
      await cleanup(connection)
      connection.preserveRemoteOnFailure = false
    }
    connection.machine = machine
    event.target = machine.target
    await step(event, 'probe', () =>
      command(connection, machine, probeCommand(machine.repoPath), 'probe'),
    )
    connection.remoteAttempted = true
    connection.record = null
    const output = await step(event, 'launch', () =>
      command(
        connection,
        machine,
        launchCommand({
          machine,
          clientId: connectionClientId(connection),
          webOrigin: options.webOrigin,
        }),
        'launch',
      ),
    )
    connection.record = await parseRemoteRecord(output)
    event.remotePort = connection.record.port
    event.managed = connection.record.kind === 'managed'
    const localPort = await step(event, 'forward', () =>
      (options.localPort ?? reserveForwardPort)(ports.get(connection.name)),
    )
    ports.set(connection.name, localPort)
    event.localPort = localPort
    connection.controller.signal.throwIfAborted()
    const forward = openForward({
      spawn,
      target: machine.target,
      localPort,
      remotePort: connection.record.port,
    })
    connection.forward = forward
    void observeForward(connection, forward)
    publish(connection, { name: connection.name, phase: 'connecting' })
    const origin = `http://127.0.0.1:${localPort}`
    const descriptor = await step(event, 'readiness', () =>
      waitForDescriptor({
        child: forward,
        origin,
        webOrigin: options.webOrigin,
        signal: connection.controller.signal,
        fetcher: options.fetcher ?? fetch,
      }),
    )
    await step(event, 'identity', async () => confirmIdentity(connection, descriptor))
    connection.controller.signal.throwIfAborted()
    connection.preserveRemoteOnFailure = true
    publish(connection, { name: connection.name, phase: 'live', origin, localPort, descriptor })
    return descriptor
  }

  function confirmIdentity(connection: Connection, descriptor: HealthDescriptor) {
    const expected = identities.get(connection.name) ?? connection.record?.environmentId
    if (
      expected !== descriptor.environmentId ||
      connection.record?.environmentId !== descriptor.environmentId
    )
      throw createSshError('identity')
    identities.set(connection.name, descriptor.environmentId)
  }

  function command(
    connection: Connection,
    machine: SshMachineDefinition,
    script: string,
    operation: SshErrorStep,
  ) {
    return runSshCommand({
      spawn,
      target: machine.target,
      script,
      step: operation,
      signal: connection.controller.signal,
    })
  }

  async function failed(connection: Connection, event: ConnectEvent, error: unknown) {
    const cancelled = connection.controller.signal.aborted
    event.error = errorMessage(error)
    if (error instanceof Error && 'code' in error && error.code === 'desktop.SSH_IDENTITY')
      event.step = 'identity'
    event.outcome = cancelled ? 'cancelled' : 'failed'
    try {
      await (connection.preserveRemoteOnFailure
        ? closeConnectionForward(connection)
        : cleanup(connection))
    } catch (cleanupError) {
      event.cleanupError = errorMessage(cleanupError)
    }
    if (cancelled) return connection.state
    const phase = failurePhase(event.step)
    publish(connection, {
      name: connection.name,
      phase,
      lastError: actionableError(error),
      lastErrorAt: Date.now(),
    })
    return connection.state
  }

  async function observeForward(connection: Connection, child: SshChild) {
    const [, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    if (connection.forward !== child || connection.controller.signal.aborted) return
    connection.forward = null
    if (connection.state.phase !== 'live') return
    const lastError = `SSH forward exited (${exitCode}). ${stderr.trim().slice(0, 1000)}`.trim()
    publish(connection, {
      name: connection.name,
      phase: 'offline',
      lastError,
      lastErrorAt: Date.now(),
    })
    writeLog(
      'desktop.ssh.forward.exited',
      {
        machine: connection.name,
        target: connection.machine?.target,
        environmentId: identities.get(connection.name),
        localPort: ports.get(connection.name),
        exitCode,
      },
      true,
    )
  }

  function connectionClientId(connection: Connection) {
    return `${options.clientId}-${connection.name}`
  }

  async function cleanup(connection: Connection) {
    await closeConnectionForward(connection)
    if (!connection.machine || !connection.remoteAttempted) return
    await runSshCommand({
      spawn,
      target: connection.machine.target,
      script: stopCommand(
        {
          machine: connection.machine,
          clientId: connectionClientId(connection),
          webOrigin: options.webOrigin,
        },
        connection.record,
      ),
      step: 'stop',
    })
    connection.remoteAttempted = false
    connection.record = null
  }

  async function closeConnectionForward(connection: Connection) {
    const forward = connection.forward
    connection.forward = null
    if (forward) await closeForward(forward)
  }

  async function disconnectMachine(input: string) {
    const name = await parseMachineName(input)
    const running = disconnecting.get(name)
    if (running) return running
    connections.get(name)?.controller.abort()
    const operation = disconnect(name).finally(() => disconnecting.delete(name))
    disconnecting.set(name, operation)
    return operation
  }

  async function disconnect(name: string) {
    await pending.get(name)
    const connection = connections.get(name)
    if (!connection) return
    const startedAt = Date.now()
    try {
      await cleanup(connection)
      connections.delete(name)
      publish(connection, { name, phase: 'idle' })
      writeLog(
        'desktop.ssh.disconnect',
        {
          machine: name,
          target: connection.machine?.target,
          environmentId: identities.get(name),
          step: 'stop',
          outcome: 'success',
          durationMs: Date.now() - startedAt,
        },
        false,
      )
    } catch (error) {
      publish(connection, {
        name,
        phase: 'offline',
        lastError: actionableError(error),
        lastErrorAt: Date.now(),
      })
      writeLog(
        'desktop.ssh.disconnect',
        {
          machine: name,
          target: connection.machine?.target,
          environmentId: identities.get(name),
          step: 'stop',
          outcome: 'failed',
          durationMs: Date.now() - startedAt,
          error: errorMessage(error),
        },
        true,
      )
      throw error
    }
  }

  async function close() {
    closing = true
    for (const connection of connections.values()) connection.controller.abort()
    await Promise.allSettled(Array.from(connections.keys(), disconnectMachine))
  }

  return { connectMachine, disconnectMachine, close }
}

function changedRemote(previous: SshMachineDefinition, next: SshMachineDefinition) {
  return (
    previous.target !== next.target ||
    previous.repoPath !== next.repoPath ||
    previous.remotePort !== next.remotePort
  )
}

function failurePhase(step: SshErrorStep) {
  if (step === 'identity') return 'identity-drift'
  if (step === 'settings' || step === 'probe') return 'blocked'
  return 'offline'
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function actionableError(error: unknown) {
  const message = errorMessage(error)
  if (
    typeof error !== 'object' ||
    error === null ||
    !('fix' in error) ||
    typeof error.fix !== 'string'
  )
    return message
  return `${message} ${error.fix}`
}

function recordEvent(action: string, fields: Record<string, unknown>, failed: boolean) {
  if (failed) return recordDesktopError(action, fields)
  recordDesktopInfo(action, fields)
}
