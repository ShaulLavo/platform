import path from 'node:path'
import * as v from 'valibot'
import type { ProviderDiscoveredSession, ProviderSessionDiscoveryInput } from './types'
import { sessionIdentityErrors } from './structured-errors'
import { discoveredSessionsSchema, discoveryInputSchema } from './utils/discovery-metadata'

const DISCOVERY_TIMEOUT_MS = 8_000
const DISCOVERY_STDERR_LIMIT = 4_096

export type ClaudeDiscoveryRunner = (input: {
  request: ProviderSessionDiscoveryInput
  env: NodeJS.ProcessEnv
}) => Promise<unknown>

export async function discoverClaudeSessions(input: {
  request: ProviderSessionDiscoveryInput
  env: NodeJS.ProcessEnv
  runner?: ClaudeDiscoveryRunner
}): Promise<ProviderDiscoveredSession[]> {
  const request = v.parse(discoveryInputSchema, input.request)
  const metadata = await (input.runner ?? runClaudeDiscovery)({ request, env: input.env })
  return v.parse(discoveredSessionsSchema, metadata)
}

function spawnClaudeDiscovery(env: NodeJS.ProcessEnv) {
  return Bun.spawn(
    [process.execPath, path.join(import.meta.dirname, 'claude-discovery-worker.ts')],
    {
      env,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )
}

export async function runClaudeDiscovery(
  input: Parameters<ClaudeDiscoveryRunner>[0],
  spawn = spawnClaudeDiscovery,
) {
  const child = spawn(input.env)
  await child.stdin.write(JSON.stringify(input.request))
  await child.stdin.end()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    child.kill()
  }, DISCOVERY_TIMEOUT_MS)
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    if (timedOut || exitCode !== 0)
      throw sessionIdentityErrors.DISCOVERY_FAILED({
        internal: {
          exitCode,
          signalCode: child.signalCode,
          stderr: stderr.slice(-DISCOVERY_STDERR_LIMIT),
          timedOut,
          timeoutMs: DISCOVERY_TIMEOUT_MS,
        },
      })
    return JSON.parse(stdout) as unknown
  } finally {
    clearTimeout(timeout)
  }
}
