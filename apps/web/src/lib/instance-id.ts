// Identifies one running app instance (a browser tab, a desktop window).
// Multiple instances write into the same log file in dev, which makes storms
// impossible to attribute without an id. Every log line ends up carrying it
// as `client.instanceId`: ingested client events get it from the log drain's
// endpoint query param (a header would be dropped by sendBeacon flushes), and
// server request logs get it from the `x-client-instance` request header.

export const instanceHeaderName = 'x-client-instance'
export const instanceQueryParam = 'instance'

let instanceId: string | null = null

export function clientInstanceId(): string {
  if (!instanceId) instanceId = createInstanceId()

  return instanceId
}

function createInstanceId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
