import { describe, expect, it } from 'vitest'
import {
  ClaudeAuthRunner,
  claudeAuthStatus,
  claudeLoginArgs,
  type ClaudeAuthCommandResult,
  type ClaudeAuthProcess,
  type ClaudeAuthSpawn,
} from '../utils/claude-auth'

/**
 * The `claude` binary is the only thing faked here, and it is faked at the one
 * seam that matters: `claude auth login` opens a real browser window, so a test
 * that reached the real CLI would hijack the developer's machine.
 */
class FakeClaudeCli {
  readonly calls: string[][] = []
  killCount = 0
  loggedIn = false
  /** Resolves the in-flight `auth login` child, mimicking the browser finishing. */
  private finishLogin: ((result: ClaudeAuthCommandResult) => void) | null = null
  private readonly statusOverride: ClaudeAuthCommandResult | null

  constructor(options: { status?: ClaudeAuthCommandResult } = {}) {
    this.statusOverride = options.status ?? null
  }

  readonly spawn: ClaudeAuthSpawn = (args) => {
    this.calls.push([...args])
    if (args[1] === 'status') return settled(this.statusOverride ?? this.statusResult())
    if (args[1] === 'logout') {
      this.loggedIn = false
      return settled(exit(0))
    }

    return this.loginProcess()
  }

  completeLogin(result: ClaudeAuthCommandResult) {
    const finish = this.finishLogin
    if (!finish) expect.unreachable('No login is in flight.')

    this.finishLogin = null
    finish(result)
  }

  loginCalls() {
    return this.calls.filter((call) => call[1] === 'login')
  }

  private loginProcess(): ClaudeAuthProcess {
    const exited = new Promise<ClaudeAuthCommandResult>((resolve) => {
      this.finishLogin = resolve
    })

    return {
      exited,
      kill: () => {
        this.killCount += 1
        this.finishLogin?.(exit(143))
        this.finishLogin = null
      },
    }
  }

  private statusResult() {
    const payload = this.loggedIn
      ? { loggedIn: true, authMethod: 'claudeai', apiProvider: 'firstParty' }
      : { loggedIn: false, authMethod: 'none', apiProvider: 'firstParty' }

    return exit(0, JSON.stringify(payload))
  }
}

function exit(exitCode: number, stdout = '', stderr = ''): ClaudeAuthCommandResult {
  return { exitCode, stderr, stdout }
}

function settled(result: ClaudeAuthCommandResult): ClaudeAuthProcess {
  return { exited: Promise.resolve(result), kill: () => {} }
}

function spawnOnce(result: ClaudeAuthCommandResult): ClaudeAuthSpawn {
  return () => settled(result)
}

async function until(predicate: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  expect.unreachable('Condition never became true.')
}

describe('claudeAuthStatus', () => {
  it('reports a signed-in account', async () => {
    const status = await claudeAuthStatus(
      spawnOnce(exit(0, '{"loggedIn":true,"authMethod":"claudeai","apiProvider":"firstParty"}\n')),
    )

    expect(status).toEqual({
      apiProvider: 'firstParty',
      authMethod: 'claudeai',
      status: 'authenticated',
    })
  })

  it('reports a signed-out account', async () => {
    const status = await claudeAuthStatus(
      spawnOnce(exit(0, '{"loggedIn":false,"authMethod":"none","apiProvider":"firstParty"}')),
    )

    expect(status.status).toBe('unauthenticated')
  })

  it('ignores a notice printed before the JSON body', async () => {
    const status = await claudeAuthStatus(
      spawnOnce(exit(0, 'A new version is available\n{"loggedIn":true}\n')),
    )

    expect(status).toEqual({ apiProvider: null, authMethod: null, status: 'authenticated' })
  })

  it('falls back to unknown on garbage output', async () => {
    const status = await claudeAuthStatus(spawnOnce(exit(0, 'not json at all')))

    expect(status.status).toBe('unknown')
  })

  it('falls back to unknown when the payload has the wrong shape', async () => {
    const status = await claudeAuthStatus(spawnOnce(exit(0, '{"loggedIn":"yes"}')))

    expect(status.status).toBe('unknown')
  })

  it('falls back to unknown on a non-zero exit', async () => {
    const status = await claudeAuthStatus(spawnOnce(exit(1, '', 'unknown command "auth"')))

    expect(status.status).toBe('unknown')
  })

  it('falls back to unknown when the binary cannot be spawned', async () => {
    const status = await claudeAuthStatus(() => ({
      exited: Promise.reject(new TypeError('ENOENT')),
      kill: () => {},
    }))

    expect(status.status).toBe('unknown')
  })
})

describe('claudeLoginArgs', () => {
  it('maps every sign-in method onto its CLI flag', () => {
    expect(claudeLoginArgs({ method: 'subscription' })).toEqual(['auth', 'login', '--claudeai'])
    expect(claudeLoginArgs({ method: 'console' })).toEqual(['auth', 'login', '--console'])
    expect(claudeLoginArgs({ method: 'sso' })).toEqual(['auth', 'login', '--sso'])
  })

  it('passes an email through to the login page', () => {
    expect(claudeLoginArgs({ email: 'dev@example.com', method: 'subscription' })).toEqual([
      'auth',
      'login',
      '--claudeai',
      '--email',
      'dev@example.com',
    ])
  })
})

describe('ClaudeAuthRunner', () => {
  it('succeeds once the CLI exits and the account reads back', async () => {
    const cli = new FakeClaudeCli()
    const runner = new ClaudeAuthRunner({ spawn: cli.spawn })
    const started = runner.startLogin({ method: 'subscription' })

    expect(started.state).toBe('pending')
    expect(started.completedAt).toBeNull()

    cli.loggedIn = true
    cli.completeLogin(exit(0, 'Login successful'))
    await until(() => runner.attempt(started.attemptId)?.state === 'succeeded')

    const settledAttempt = runner.attempt(started.attemptId)
    expect(settledAttempt?.completedAt).not.toBeNull()
    expect(settledAttempt?.outputTail).toEqual(['Login successful'])
  })

  it('fails when the CLI exits non-zero and keeps the output tail', async () => {
    const cli = new FakeClaudeCli()
    const runner = new ClaudeAuthRunner({ spawn: cli.spawn })
    const started = runner.startLogin({ method: 'console' })

    cli.completeLogin(exit(1, '', 'OAuth callback rejected'))
    await until(() => runner.attempt(started.attemptId)?.state === 'failed')

    const settledAttempt = runner.attempt(started.attemptId)
    expect(settledAttempt?.message).toBe('OAuth callback rejected')
    expect(settledAttempt?.outputTail).toEqual(['OAuth callback rejected'])
  })

  it('fails when the CLI exits clean but no account was linked', async () => {
    const cli = new FakeClaudeCli()
    const runner = new ClaudeAuthRunner({ spawn: cli.spawn })
    const started = runner.startLogin({ method: 'sso' })

    cli.completeLogin(exit(0))
    await until(() => runner.attempt(started.attemptId)?.state === 'failed')

    expect(runner.attempt(started.attemptId)?.message).toContain('still reports no account')
  })

  it('returns the in-flight attempt instead of opening a second browser', async () => {
    const cli = new FakeClaudeCli()
    const runner = new ClaudeAuthRunner({ spawn: cli.spawn })
    const first = runner.startLogin({ method: 'subscription' })
    const second = runner.startLogin({ method: 'console' })

    expect(second.attemptId).toBe(first.attemptId)
    expect(second.method).toBe('subscription')
    expect(cli.loginCalls()).toHaveLength(1)

    cli.completeLogin(exit(0))
    await until(() => runner.attempt(first.attemptId)?.state !== 'pending')

    const third = runner.startLogin({ method: 'console' })
    expect(third.attemptId).not.toBe(first.attemptId)
    expect(cli.loginCalls()).toHaveLength(2)
  })

  it('cancels an attempt and kills the child', () => {
    const cli = new FakeClaudeCli()
    const runner = new ClaudeAuthRunner({ spawn: cli.spawn })
    const started = runner.startLogin({ method: 'subscription' })
    const cancelled = runner.cancel(started.attemptId)

    expect(cancelled?.state).toBe('cancelled')
    expect(cancelled?.message).toBe('Sign-in was cancelled.')
    expect(cli.killCount).toBe(1)
    expect(runner.attempt(started.attemptId)?.state).toBe('cancelled')
  })

  it('does not know about attempts it did not start', () => {
    const cli = new FakeClaudeCli()
    const runner = new ClaudeAuthRunner({ spawn: cli.spawn })
    runner.startLogin({ method: 'subscription' })

    expect(runner.attempt('nope')).toBeNull()
    expect(runner.cancel('nope')).toBeNull()
  })

  it('times out instead of leaking the child process forever', async () => {
    const cli = new FakeClaudeCli()
    const runner = new ClaudeAuthRunner({ spawn: cli.spawn, timeoutMs: 10 })
    const started = runner.startLogin({ method: 'subscription' })

    await until(() => runner.attempt(started.attemptId)?.state === 'failed')

    expect(runner.attempt(started.attemptId)?.message).toContain('timed out')
    expect(cli.killCount).toBe(1)
  })

  it('cancels a pending login when signing out', async () => {
    const cli = new FakeClaudeCli()
    const runner = new ClaudeAuthRunner({ spawn: cli.spawn })
    cli.loggedIn = true
    const started = runner.startLogin({ method: 'subscription' })

    await runner.signOut()

    expect(runner.attempt(started.attemptId)?.state).toBe('cancelled')
    expect(cli.loggedIn).toBe(false)
  })

  it('reports a failed sign-out', async () => {
    const runner = new ClaudeAuthRunner({ spawn: spawnOnce(exit(1, '', 'not signed in')) })

    await expect(runner.signOut()).rejects.toThrow('exited with code 1')
  })
})
