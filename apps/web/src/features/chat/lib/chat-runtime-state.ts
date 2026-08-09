import type { ProviderSnapshot } from '@workspace/contracts'

import {
  isProviderAuthError,
  providerSignInTarget,
  type ProviderSignInTarget,
} from '@/features/chat/lib/provider-auth'
import type { ChatThread } from '../state/chat-projection-store'

export type ChatRuntimeAlertTone = 'busy' | 'error' | 'warning'

export type ChatCommandState = {
  commandFailure: string | null
  interruptPending: boolean
  sendPending: boolean
  stopPending: boolean
}

export type ChatRuntimeAlert = {
  detail: string | null
  id: string
  /** Set when the alert is an auth failure the user can clear by signing in. */
  signIn: ProviderSignInTarget | null
  title: string
  tone: ChatRuntimeAlertTone
}

export function chatRuntimeAlerts({
  commandState,
  provider,
  providerError,
  providerLoading = false,
  thread,
}: {
  commandState: ChatCommandState
  provider: ProviderSnapshot | undefined
  providerError: string | null
  providerLoading?: boolean
  thread: ChatThread
}) {
  return [
    ...commandAlerts(commandState),
    ...providerAlerts(provider, providerError, providerLoading, thread),
    ...threadErrorAlerts(thread, provider),
    ...pendingActionAlerts(thread),
  ]
}

function commandAlerts(commandState: ChatCommandState): ChatRuntimeAlert[] {
  if (commandState.commandFailure) {
    return [alert('command:failure', 'Command failed', commandState.commandFailure, 'error')]
  }
  if (commandState.interruptPending) {
    return [alert('command:interrupt', 'Interrupting current turn', null, 'busy')]
  }
  if (commandState.stopPending) {
    return [alert('command:stop', 'Stopping session', null, 'busy')]
  }
  if (commandState.sendPending) {
    return [alert('command:send', 'Sending message', null, 'busy')]
  }

  return []
}

function providerAlerts(
  provider: ProviderSnapshot | undefined,
  providerError: string | null,
  providerLoading: boolean,
  thread: ChatThread,
): ChatRuntimeAlert[] {
  if (providerError) {
    return [alert('provider', 'Provider check failed', providerError, 'error')]
  }
  if (providerLoading && !provider) return []
  if (!provider) {
    return [
      alert(
        'provider',
        'Provider unavailable',
        `No snapshot for ${thread.modelSelection.providerInstanceId}`,
        'warning',
      ),
    ]
  }
  if (!provider.installed || provider.availability === 'unavailable') {
    return [
      alert('provider', `${provider.displayLabel} provider unavailable`, provider.message, 'error'),
    ]
  }
  if (provider.auth.status === 'unauthenticated') {
    return [
      alert(
        'provider',
        `${provider.displayLabel} authentication required`,
        provider.auth.label ?? provider.message,
        'error',
        providerSignInTarget(provider),
      ),
    ]
  }
  if (provider.status === 'warning') {
    return [
      alert(
        'provider',
        `${provider.displayLabel} provider status`,
        provider.message ?? `${provider.displayLabel} provider has limited availability.`,
        'warning',
      ),
    ]
  }
  if (provider.status === 'error') {
    return [
      alert(
        'provider',
        `${provider.displayLabel} provider status`,
        provider.message ?? `${provider.displayLabel} provider is unavailable.`,
        'error',
        authSignIn(provider.message, provider),
      ),
    ]
  }

  return []
}

function threadErrorAlerts(
  thread: ChatThread,
  provider: ProviderSnapshot | undefined,
): ChatRuntimeAlert[] {
  const lastError = thread.session?.lastError
  if (lastError) {
    return [
      alert(
        'thread:error',
        threadErrorTitle(lastError, provider),
        lastError,
        'error',
        authSignIn(lastError, provider),
      ),
    ]
  }
  if (thread.latestTurn?.state === 'error') {
    return [alert('turn:error', 'Turn failed', null, 'error')]
  }

  return []
}

/**
 * A mid-turn credential failure is not a mystery "thread error": name it, so the
 * title matches the Sign in button sitting next to it.
 */
function threadErrorTitle(lastError: string, provider: ProviderSnapshot | undefined) {
  if (needsSignIn(lastError, provider)) return 'Sign-in required'

  return 'Thread error'
}

/** Sign-in is only offered for messages that actually mean "sign in again". */
function authSignIn(message: string | null | undefined, provider: ProviderSnapshot | undefined) {
  if (!needsSignIn(message, provider)) return null

  return providerSignInTarget(provider)
}

/**
 * `lastError` is a persisted record of a past turn, so an old credential failure
 * outlives the credentials that caused it. Matching on the message alone kept
 * telling an already-signed-in user to sign in, with a button that opened a
 * dialog reporting their own account back at them. Current auth state decides.
 */
function needsSignIn(message: string | null | undefined, provider: ProviderSnapshot | undefined) {
  if (!isProviderAuthError(message)) return false
  if (provider?.auth.status === 'authenticated') return false

  return true
}

function pendingActionAlerts(thread: ChatThread): ChatRuntimeAlert[] {
  const alerts: ChatRuntimeAlert[] = []

  if (thread.pendingApprovalCount > 0) {
    alerts.push(
      alert('approval', 'Approval requested', `${thread.pendingApprovalCount} pending`, 'warning'),
    )
  }
  if (thread.pendingUserInputCount > 0) {
    alerts.push(
      alert(
        'user-input',
        'User input requested',
        `${thread.pendingUserInputCount} pending`,
        'warning',
      ),
    )
  }

  return alerts
}

function alert(
  id: string,
  title: string,
  detail: string | null | undefined,
  tone: ChatRuntimeAlertTone,
  signIn: ProviderSignInTarget | null = null,
): ChatRuntimeAlert {
  return {
    detail: detail ?? null,
    id,
    signIn,
    title,
    tone,
  }
}
