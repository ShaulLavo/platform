import {
  healthDescriptorSchema,
  machineNameSchema,
  machinesSchema,
  type EnvironmentId,
  type HealthDescriptor,
} from '@workspace/contracts'
import { createSshError, type SshErrorStep } from '../structured-errors'

export type RemoteRecord = {
  leaseId: string
  processId: string | null
  kind: 'managed' | 'external'
  pid: number | null
  port: number
  environmentId: EnvironmentId
  startedAt: string | null
}

export async function parseMachineName(input: unknown) {
  const result = await machineNameSchema['~standard'].validate(input)
  if (result.issues) throw createSshError('settings', result.issues[0]?.message)
  return result.value
}

export async function parseMachineSettings(input: unknown) {
  const result = await machinesSchema['~standard'].validate(input)
  if (result.issues) throw createSshError('settings', result.issues[0]?.message)
  return result.value
}

export async function parseDescriptor(input: unknown): Promise<HealthDescriptor> {
  const result = await healthDescriptorSchema['~standard'].validate(input)
  if (result.issues) throw createSshError('readiness', result.issues[0]?.message)
  return result.value
}

export async function parseRemoteRecord(output: string): Promise<RemoteRecord> {
  const input: unknown = JSON.parse(output.trim())
  if (typeof input !== 'object' || input === null)
    throw createSshError('launch', 'Invalid launch record.')
  if (!('descriptor' in input)) throw createSshError('launch', 'Missing remote descriptor.')
  if (
    !('leaseId' in input) ||
    typeof input.leaseId !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(input.leaseId)
  )
    throw createSshError('launch', 'Invalid remote lease identity.')
  const descriptor = await parseDescriptor(input.descriptor)
  if (
    !('port' in input) ||
    typeof input.port !== 'number' ||
    !Number.isInteger(input.port) ||
    input.port < 1 ||
    input.port > 65_535
  ) {
    throw createSshError('launch', 'Invalid remote port.')
  }
  if (!('kind' in input) || !('pid' in input))
    throw createSshError('launch', 'Missing process ownership.')
  if (!('processId' in input)) throw createSshError('launch', 'Missing managed process identity.')
  if (input.kind === 'external' && input.pid === null && input.processId === null)
    return {
      leaseId: input.leaseId,
      processId: null,
      kind: 'external',
      pid: null,
      port: input.port,
      environmentId: descriptor.environmentId,
      startedAt: null,
    }
  if (
    input.kind !== 'managed' ||
    typeof input.processId !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(input.processId) ||
    typeof input.pid !== 'number' ||
    !Number.isInteger(input.pid) ||
    input.pid < 1
  ) {
    throw createSshError('launch', 'Invalid managed process.')
  }
  if (!('startedAt' in input) || typeof input.startedAt !== 'string' || !input.startedAt.trim())
    throw createSshError('launch', 'Missing managed process start stamp.')
  return {
    leaseId: input.leaseId,
    processId: input.processId,
    kind: 'managed',
    pid: input.pid,
    port: input.port,
    environmentId: descriptor.environmentId,
    startedAt: input.startedAt,
  }
}

export async function readPrimaryMachines(serverOrigin: string, webOrigin: string) {
  const response = await fetch(`${serverOrigin}/settings`, {
    headers: { Origin: webOrigin },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok)
    throw createSshError('settings', `Settings request returned ${response.status}.`)
  const snapshot: unknown = await response.json()
  if (typeof snapshot !== 'object' || snapshot === null || !('values' in snapshot))
    throw createSshError('settings')
  const values = snapshot.values
  if (typeof values !== 'object' || values === null || !('environments.machines' in values))
    throw createSshError('settings')
  return parseMachineSettings(values['environments.machines'])
}

export function remoteFailure(step: SshErrorStep, stderr: string, exitCode: number) {
  try {
    const input: unknown = JSON.parse(stderr.trim().split('\n').at(-1) ?? '')
    if (
      typeof input === 'object' &&
      input !== null &&
      'code' in input &&
      input.code === 'desktop.SSH_IDENTITY'
    )
      return createSshError('identity')
  } catch {
    // OpenSSH failures are plain stderr; remote launch failures also carry a JSON error.
  }
  return createSshError(step, stderr.trim().slice(0, 2000) || `SSH exited with status ${exitCode}.`)
}
