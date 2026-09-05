import { readEnvironmentDescriptor } from '@/lib/environments/utils/descriptor'
import { createClientError } from '@/lib/structured-errors'

export function parseDevOrigin(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw invalidOrigin()
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (!loopback || url.protocol !== 'http:' || !url.port) throw invalidOrigin()
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw invalidOrigin()
  return url.origin
}

export async function checkDevOrigin(value: string, signal: AbortSignal): Promise<string> {
  const origin = parseDevOrigin(value)
  await readEnvironmentDescriptor(origin, signal)
  return origin
}

function invalidOrigin() {
  return createClientError({
    code: 'INVALID_DEV_ORIGIN',
    status: 400,
    message: 'Use http://localhost:<port> or http://127.0.0.1:<port>.',
    why: 'The development switch accepts only a local HTTP origin without a path or credentials.',
    fix: 'Enter the origin of the local Platform server.',
  })
}
