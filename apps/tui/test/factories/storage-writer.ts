import path from 'node:path'
import type { EnvironmentId } from '@workspace/contracts'

export function startStorageWriter(
  directory: string,
  environmentId: EnvironmentId,
  prefix: string,
) {
  const ready = Promise.withResolvers<void>()
  const child = Bun.spawn({
    cmd: [
      process.execPath,
      path.resolve(import.meta.dirname, '../processes/storage-writer.ts'),
      directory,
      environmentId,
      prefix,
    ],
    cwd: path.resolve(import.meta.dirname, '../..'),
    stdin: 'pipe',
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 5000,
    ipc(message: unknown) {
      if (message === 'ready') ready.resolve()
    },
  })
  const error = new Response(child.stderr).text()
  return {
    child,
    ready: Promise.race([ready.promise, child.exited]),
    run() {
      child.stdin.write('start')
      child.stdin.end()
    },
    async result() {
      return { code: await child.exited, error: await error }
    },
  }
}
