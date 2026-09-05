import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROVIDER_DRIVER_KIND,
  DEFAULT_PROVIDER_INSTANCE_ID,
  DEFAULT_RUNTIME_MODE,
  type ProviderSnapshot,
} from '@workspace/contracts'

import type { ChatSession } from '@/features/chat/state/chat-projection-store'
import { chatRuntimeAlerts } from '@/features/chat/utils/runtime-state'
import { session } from '../../../../../test/factories/chat'

describe('chat runtime state', () => {
  it('renders only attention-worthy command, provider, and pending action states', () => {
    const alerts = chatRuntimeAlerts({
      commandState: {
        commandFailure: 'Dispatch rejected',
        interruptPending: true,
        sendPending: false,
        stopPending: false,
      },
      provider: provider({ auth: { status: 'unauthenticated' }, status: 'error' }),
      providerError: null,
      session: session({
        hasActionableProposedPlan: true,
        pendingApprovalCount: 1,
        pendingUserInputCount: 2,
      }),
    })

    expect(alerts.map((alert) => [alert.id, alert.title, alert.tone])).toEqual([
      ['command:failure', 'Command failed', 'error'],
      ['provider', 'Codex authentication required', 'error'],
      ['approval', 'Approval requested', 'warning'],
      ['user-input', 'User input requested', 'warning'],
    ])
  })

  it('offers sign-in on the authentication alert of a provider the app can sign in', () => {
    const [providerAlert] = chatRuntimeAlerts({
      commandState: idle(),
      provider: provider({
        auth: { status: 'unauthenticated' },
        message: 'Claude Code is not signed in.',
        status: 'error',
        supportsSignIn: true,
      }),
      providerError: null,
      session: session(),
    })

    expect(providerAlert.signIn).toEqual({
      providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
      providerLabel: 'Codex',
    })
    expect(providerAlert.detail).toBe('Claude Code is not signed in.')
  })

  it('offers sign-in on a mid-turn credential failure instead of a dead-end message', () => {
    const lastError = 'OAuth session expired and could not be refreshed'
    // Auth `unknown`, not `unauthenticated`: the CLI has not said either way, so
    // the only signal that credentials are gone is the turn that just failed.
    const [sessionAlert] = chatRuntimeAlerts({
      commandState: idle(),
      provider: provider({ auth: { status: 'unknown' }, supportsSignIn: true }),
      providerError: null,
      session: sessionWithError(lastError),
    })

    expect(sessionAlert).toMatchObject({
      detail: lastError,
      id: 'session:error',
      signIn: { providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID, providerLabel: 'Codex' },
      title: 'Sign-in required',
    })
  })

  /**
   * `lastError` is persisted, so a credential failure outlives the credentials
   * that caused it. Matching on the message alone told an already-signed-in user
   * to sign in, and the dialog then reported their own account back at them.
   */
  it('stops demanding sign-in once the provider is authenticated again', () => {
    const lastError = 'OAuth session expired and could not be refreshed'
    const [sessionAlert] = chatRuntimeAlerts({
      commandState: idle(),
      provider: provider({
        auth: { email: 'someone@example.com', status: 'authenticated' },
        supportsSignIn: true,
      }),
      providerError: null,
      session: sessionWithError(lastError),
    })

    expect(sessionAlert).toMatchObject({
      detail: lastError,
      id: 'session:error',
      signIn: null,
      title: 'Session error',
    })
  })

  it('leaves non-auth session errors alone', () => {
    const [sessionAlert] = chatRuntimeAlerts({
      commandState: idle(),
      provider: provider({ supportsSignIn: true }),
      providerError: null,
      session: sessionWithError('spawn claude ENOENT'),
    })

    expect(sessionAlert.title).toBe('Session error')
    expect(sessionAlert.signIn).toBe(null)
  })

  it('never offers sign-in for a provider the server cannot sign in', () => {
    const [sessionAlert] = chatRuntimeAlerts({
      commandState: idle(),
      provider: provider({ auth: { status: 'unknown' } }),
      providerError: null,
      session: sessionWithError('Invalid API key · Please run /login'),
    })

    expect(sessionAlert.title).toBe('Sign-in required')
    expect(sessionAlert.signIn).toBe(null)
  })

  it('sorts what the user can act on above what is merely happening', () => {
    const alerts = chatRuntimeAlerts({
      commandState: { ...idle(), sendPending: true },
      provider: provider({ message: 'Rate limited', status: 'warning' }),
      providerError: null,
      session: session({ pendingUserInputCount: 1 }),
    })

    // Produced in the order busy, warning, action — sorted the other way round,
    // so the front banner is the one holding the turn open.
    expect(alerts.map((alert) => alert.id)).toEqual(['user-input', 'provider', 'command:send'])
  })

  it('makes stale notices dismissible and live requests not, keyed by their message', () => {
    const [failure] = chatRuntimeAlerts({
      commandState: { ...idle(), commandFailure: 'Dispatch rejected' },
      provider: provider(),
      providerError: null,
      session: session({ pendingApprovalCount: 1 }),
    })
    const [request] = chatRuntimeAlerts({
      commandState: idle(),
      provider: provider(),
      providerError: null,
      session: session({ pendingApprovalCount: 1 }),
    })

    // The key carries the message: waving away one failure must not swallow the
    // next, different one under the same id.
    expect(failure.dismissKey).toBe('command:failure:Command failed:Dispatch rejected')
    // The turn is parked on the answer; hiding the ask would strand the session.
    expect(request.dismissKey).toBeNull()
  })

  it('hides ready provider, running session, running turn, and available plan states', () => {
    const alerts = chatRuntimeAlerts({
      commandState: {
        commandFailure: null,
        interruptPending: false,
        sendPending: false,
        stopPending: false,
      },
      provider: provider(),
      providerError: null,
      session: session({ hasActionableProposedPlan: true }),
    })

    expect(alerts).toEqual([])
  })
})

function idle() {
  return {
    commandFailure: null,
    interruptPending: false,
    sendPending: false,
    stopPending: false,
  }
}

function sessionWithError(lastError: string): ChatSession {
  const base = session()

  return { ...base, runtime: base.runtime ? { ...base.runtime, lastError } : null }
}

function provider(overrides: Partial<ProviderSnapshot> = {}): ProviderSnapshot {
  return {
    auth: { status: 'authenticated' },
    checkedAt: timestamp(1),
    displayLabel: 'Codex',
    driverKind: DEFAULT_PROVIDER_DRIVER_KIND,
    enabled: true,
    installed: true,
    models: [],
    providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
    runtimeModes: [DEFAULT_RUNTIME_MODE],
    status: 'ready',
    traits: {
      supportsApprovals: false,
      supportsFullAccess: true,
      supportsInterrupt: true,
      supportsSessionStop: true,
      supportsStreaming: true,
      supportsUserInput: false,
    },
    version: '1.0.0',
    ...overrides,
  }
}

function timestamp(index: number) {
  return `2026-05-28T00:00:0${index}.000Z`
}
