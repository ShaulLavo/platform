import type { ProviderSnapshot } from '@workspace/contracts'

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
    ...threadErrorAlerts(thread),
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
        provider.auth.label,
        'error',
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
      ),
    ]
  }

  return []
}

function threadErrorAlerts(thread: ChatThread): ChatRuntimeAlert[] {
  if (thread.session?.lastError) {
    return [alert('thread:error', 'Thread error', thread.session.lastError, 'error')]
  }
  if (thread.latestTurn?.state === 'error') {
    return [alert('turn:error', 'Turn failed', null, 'error')]
  }

  return []
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
): ChatRuntimeAlert {
  return {
    detail: detail ?? null,
    id,
    title,
    tone,
  }
}
