export function createTilingInvariantError(message: string, cause?: unknown) {
  return new Error(message, cause === undefined ? undefined : { cause })
}
