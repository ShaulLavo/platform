export type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading'; data?: T }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string }

export const idleState = { status: 'idle' } as const
