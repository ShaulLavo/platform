// Eden revives date-shaped strings, but contract schemas still require ISO strings.
export function normalizeEdenDates(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(normalizeEdenDates)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, normalizeEdenDates(entry)]),
  )
}
