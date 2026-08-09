export function runtimeEventId(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`
}

export function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

export function noop() {}
