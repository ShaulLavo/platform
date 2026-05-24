type ClientErrorReport = {
  area: string
  operation: string
  message: string
  category?: string
  cause?: unknown
  context?: Record<string, unknown>
}

const redactedDiagnosticValue = '[redacted]'
const sensitiveFields = new Set([
  'absolutePath',
  'authorization',
  'cwd',
  'dest',
  'destination',
  'fileName',
  'filename',
  'path',
  'stack',
  'token',
])

export function reportClientError(report: ClientErrorReport): void {
  console.error(`[client:${report.area}] ${report.operation}`, safeClientErrorReport(report))
}

function safeClientErrorReport(report: ClientErrorReport) {
  return {
    category: report.category,
    cause: sanitizeDiagnosticValue(report.cause),
    context: sanitizeDiagnosticValue(report.context),
    message: report.message,
  }
}

function sanitizeDiagnosticValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) return sanitizeError(value, seen)
  if (Array.isArray(value)) return value.map((item) => sanitizeDiagnosticValue(item, seen))
  if (!isPlainObject(value)) return value
  if (seen.has(value)) return '[circular]'

  seen.add(value)
  return sanitizeRecord(value, seen)
}

function sanitizeError(error: Error, seen: WeakSet<object>) {
  if (seen.has(error)) return '[circular]'

  seen.add(error)
  return {
    cause: sanitizeDiagnosticValue(error.cause, seen),
    message: error.message,
    name: error.name,
  }
}

function sanitizeRecord(record: Record<string, unknown>, seen: WeakSet<object>) {
  const safe: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(record)) {
    safe[key] = sensitiveFields.has(key) ? redactedDiagnosticValue : sanitizeDiagnosticValue(value, seen)
  }

  return safe
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
