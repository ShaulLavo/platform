import path from 'node:path'
import { observabilityEnabledFromEnv } from '../packages/observability/src/env'
import { observabilityEnvFromFile } from '../packages/observability/src/env-file'

const root = path.resolve(import.meta.dirname, '..')
const env = observabilityEnvFromFile(path.join(root, '.env'), Bun.env)
const turbo = path.join(root, 'node_modules/.bin/turbo')

const args = Bun.argv.slice(2)
const command = [turbo, 'dev', ...args]
if (shouldSilenceDevOutput(args)) command.push('--output-logs=none')

const child = Bun.spawn({
  cmd: command,
  cwd: root,
  env,
  stderr: 'inherit',
  stdout: 'inherit',
})

installSignalHandlers(child)
process.exit(await child.exited)

function shouldSilenceDevOutput(args: readonly string[]) {
  if (observabilityEnabledFromEnv(env)) return false

  return !args.some((arg) => arg.startsWith('--output-logs'))
}

function installSignalHandlers(child: ReturnType<typeof Bun.spawn>) {
  const stop = (signal: NodeJS.Signals) => {
    child.kill(signal)
  }

  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}
