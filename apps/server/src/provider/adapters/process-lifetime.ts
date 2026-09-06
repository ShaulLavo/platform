import type { ChildProcess } from 'node:child_process'
import { createInternalError } from '../../observability/structured-errors'

export class ProviderProcessLifetime {
  private readonly child: ChildProcess
  private readonly exited = Promise.withResolvers<void>()
  private ended = false

  constructor(child: ChildProcess) {
    this.child = child
    child.once('exit', () => this.acknowledgeExit())
    child.once('error', () => {
      if (child.pid === undefined) this.acknowledgeExit()
    })
    if (typeof child.exitCode === 'number' || child.signalCode != null) this.acknowledgeExit()
  }

  isAlive() {
    return !this.ended
  }

  async close() {
    if (this.ended) return
    this.child.kill('SIGTERM')
    const force = setTimeout(() => {
      if (this.ended) return
      try {
        this.child.kill('SIGKILL')
      } catch {
        /* Exit acknowledgement remains required. */
      }
    }, 1_000)
    let deadline: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_resolve, reject) => {
      deadline = setTimeout(
        () => reject(createInternalError('Provider process exit was not acknowledged.')),
        5_000,
      )
    })
    try {
      await Promise.race([this.exited.promise, timeout])
    } finally {
      clearTimeout(force)
      clearTimeout(deadline)
    }
  }

  private acknowledgeExit() {
    this.ended = true
    this.exited.resolve()
  }
}
