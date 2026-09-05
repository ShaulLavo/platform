const maxStringLength = 2_000
const redactedDiagnosticValue = '[redacted]'
// Server logs already retain stack traces, so the client keeps them for the
// same diagnostic value while credentials and request payloads stay redacted.
const sensitiveFields = new Set([
  'absolutePath',
  'authorization',
  'body',
  'content',
  'cookie',
  'cwd',
  'dest',
  'destination',
  'fileName',
  'filename',
  'password',
  'patch',
  'secret',
  'set-cookie',
  'text',
  'token',
  'x-api-key',
])

export function sanitizeRecord(record: Record<string, unknown>, seen = new WeakSet<object>()) {
  const safe: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(record)) {
    safe[key] = sensitiveFields.has(key)
      ? redactedDiagnosticValue
      : sanitizeDiagnosticValue(value, seen)
  }

  return safe
}

function sanitizePrimitive(value: unknown) {
  return typeof value === 'string' ? limitDiagnosticString(value) : value
}

function sanitizeDiagnosticValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) return sanitizeError(value, seen)
  if (Array.isArray(value)) return value.map((item) => sanitizeDiagnosticValue(item, seen))
  if (!isRecord(value)) return sanitizePrimitive(value)
  if (seen.has(value)) return '[circular]'

  seen.add(value)
  return sanitizeRecord(value, seen)
}

function sanitizeError(error: Error, seen: WeakSet<object>) {
  if (seen.has(error)) return '[circular]'

  seen.add(error)
  return {
    cause: sanitizeDiagnosticValue(error.cause, seen),
    message: limitDiagnosticString(error.message),
    name: error.name,
    stack: error.stack,
  }
}

export function limitDiagnosticString(value: string) {
  if (value.length <= maxStringLength) return value

  return value.slice(0, maxStringLength)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
