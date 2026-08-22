import { createInternalError } from '../observability/structured-errors'

const MAX_IDLE_PASSES = 1_000

export type IdleSource = {
  drain: () => Promise<void>
  isIdle: () => boolean
  readonly name: string
}

/**
 * The single owner of "is the provider pipeline idle?". Sources feed each other
 * — ingestion settles a turn, settling a turn gives the checkpoint reactor
 * something to capture — so one pass over them proves nothing. Idle is when
 * every registered source reports idle after the same pass.
 */
export class ReactorScheduler {
  private readonly sources: IdleSource[] = []

  register(source: IdleSource) {
    this.sources.push(source)
  }

  async idle() {
    for (let pass = 0; pass < MAX_IDLE_PASSES; pass += 1) {
      for (const source of this.sources) {
        await source.drain()
      }
      if (this.sources.every((source) => source.isIdle())) return
    }

    throw createInternalError(
      `Reactors did not settle within ${MAX_IDLE_PASSES} passes: ${this.busyNames()}`,
    )
  }

  private busyNames() {
    return this.sources
      .filter((source) => !source.isIdle())
      .map((source) => source.name)
      .join(', ')
  }
}
