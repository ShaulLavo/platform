export type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string }

export type KeyedLoadState<T> = {
  key: string
  state: LoadState<T>
}

export const idleState = { status: 'idle' } as const

export function loadStateForKey<T>(
  load: KeyedLoadState<T> | null,
  key: string | null,
): LoadState<T> {
  if (!key) return idleState
  if (load?.key === key) return load.state

  return { status: 'loading' }
}

export function requestKey(path: string, version: number) {
  return `${path}\u0000${version}`
}
