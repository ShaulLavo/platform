import { createError, type ErrorOptions } from 'evlog'

export type ClientStructuredErrorOptions = Omit<ErrorOptions, 'cause'> & {
  readonly cause?: unknown
}

export function createClientError({ cause, ...options }: ClientStructuredErrorOptions) {
  const error = createError(options)
  if (cause !== undefined) Object.assign(error, { cause })
  return error
}
