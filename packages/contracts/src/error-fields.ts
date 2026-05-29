export type ErrorStringFieldOptions = {
  maxLength?: number
  preserve?: 'end' | 'start'
}

export function errorStringField(
  error: unknown,
  field: string,
  options: ErrorStringFieldOptions = {},
) {
  const value = errorFieldValue(error, field)
  if (typeof value !== 'string') return undefined

  return limitErrorStringField(value, options)
}

export function errorNumberField(error: unknown, field: string) {
  const value = errorFieldValue(error, field)
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function errorFieldValue(error: unknown, field: string) {
  if (!isErrorFieldContainer(error)) return undefined
  if (!(field in error)) return undefined

  return error[field]
}

function isErrorFieldContainer(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function limitErrorStringField(value: string, options: ErrorStringFieldOptions) {
  if (options.maxLength === undefined) return value

  const maxLength = Math.max(0, options.maxLength)
  if (value.length <= maxLength) return value
  if (options.preserve === 'end') return value.slice(Math.max(0, value.length - maxLength))

  return value.slice(0, maxLength)
}
