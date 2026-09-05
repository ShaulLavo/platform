import path from 'node:path'
import * as v from 'valibot'
import type { ProviderDiscoveredSession, ProviderSessionDiscoveryInput } from './types'
import { sessionIdentityErrors } from './structured-errors'
import { discoveredSessionsSchema, discoveryInputSchema } from './utils/discovery-metadata'

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

async function runClaudeDiscovery(input: Parameters<ClaudeDiscoveryRunner>[0]) {
  const child = Bun.spawn(
    [process.execPath, path.join(import.meta.dirname, 'claude-discovery-worker.ts')],
    {
      env: input.env,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )
  await child.stdin.write(JSON.stringify(input.request))
  await child.stdin.end()
  const timeout = setTimeout(() => {
    child.kill()
  }, 8_000)
  try {
    const [stdout, , exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    if (exitCode !== 0) throw sessionIdentityErrors.DISCOVERY_FAILED()
    return JSON.parse(stdout) as unknown
  } finally {
    clearTimeout(timeout)
  }
}
