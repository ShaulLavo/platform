import { createHash } from 'node:crypto'

export function commandFingerprint(command: unknown) {
  return createHash('sha256').update(canonicalJson(command)).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'

  const entries: [string, unknown][] = Object.entries(value)
  return `{${entries
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(',')}}`
}
