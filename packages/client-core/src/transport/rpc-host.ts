export type OrchestrationSocketEvents = {
  readonly open: { readonly type: string }
  readonly message: { readonly data: unknown }
  readonly error: { readonly type: string }
  readonly close: { readonly code: number; readonly reason: string; readonly wasClean: boolean }
}

export type OrchestrationSocket = {
  readonly readyState: number
  send(data: string): void
  close(): void
  addEventListener<K extends keyof OrchestrationSocketEvents>(
    type: K,
    listener: (event: OrchestrationSocketEvents[K]) => void,
  ): void
}

export type RpcEvent = {
  readonly action: string
  readonly area: string
  readonly [key: string]: unknown
}

export type RpcEventScope = {
  set(context: Record<string, unknown>): void
  increment(path: string, by?: number): void
  warn(message: string, context?: Record<string, unknown>): void
  error(error: unknown, context?: Record<string, unknown>): void
  end(overrides?: Record<string, unknown>): void
}

export type RpcObservation = {
  createScope(event: RpcEvent): RpcEventScope
  observeOperation<T>(
    event: RpcEvent,
    operation: () => Promise<T>,
    summarize?: (result: T) => Record<string, unknown>,
  ): Promise<T>
}
