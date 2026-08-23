import { useQuery } from '@tanstack/react-query'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'
import { WarningCircleIcon, XIcon } from '@phosphor-icons/react'
import { useState } from 'react'

import {
  chatRuntimeAlerts,
  type ChatCommandState,
  type ChatRuntimeAlert,
  type ChatRuntimeAlertTone,
} from '@/features/chat/utils/runtime-state'
import { errorMessage } from '@/lib/error-message'
import { useProviderSignInDialog } from '../hooks/use-provider-sign-in-dialog'
import { providerListQueryOptions } from '@/features/chat/utils/provider-query'
import type { ChatThread } from '../state/chat-projection-store'
import { Spinner } from '@workspace/ui/components/spinner'

/**
 * The runtime notice stack above the composer. Only the most urgent notice is
 * expanded; the rest fold behind a disclosure so a thread with a provider
 * warning, a pending approval and a live spinner cannot walk the composer off
 * the bottom of the viewport.
 */
export function ChatRuntimeStatus({
  commandFailure,
  interruptPending,
  sendPending,
  stopPending,
  thread,
}: ChatCommandState & {
  thread: ChatThread
}) {
  const { openSignIn } = useProviderSignInDialog()
  const providersQuery = useQuery(providerListQueryOptions())
  const [dismissedKeys, setDismissedKeys] = useState<readonly string[]>([])
  const [expanded, setExpanded] = useState(false)
  const provider = providersQuery.data?.providers.find(
    (candidate) => candidate.providerInstanceId === thread.modelSelection.providerInstanceId,
  )
  const alerts = chatRuntimeAlerts({
    commandState: { commandFailure, interruptPending, sendPending, stopPending },
    provider,
    providerError: providersQuery.error
      ? errorMessage(providersQuery.error, 'Provider request failed.')
      : null,
    providerLoading: providersQuery.isLoading,
    thread,
  }).filter((alert) => !alert.dismissKey || !dismissedKeys.includes(alert.dismissKey))

  const [front, ...folded] = alerts
  if (!front) return null

  function dismiss(alert: ChatRuntimeAlert) {
    if (!alert.dismissKey) return

    const dismissKey = alert.dismissKey
    setDismissedKeys((keys) => (keys.includes(dismissKey) ? keys : [...keys, dismissKey]))
  }

  return (
    <div
      aria-label='Runtime notices'
      className='compact:px-2 compact:pt-2 shrink-0 px-3 pt-3'
      role='status'
    >
      <div className='compact:space-y-1.5 mx-auto max-w-3xl space-y-2'>
        <RuntimeAlert alert={front} onDismiss={dismiss} onSignIn={openSignIn} />
        {folded.length === 0 ? null : (
          <Button
            aria-expanded={expanded}
            className='text-muted-foreground hover:text-foreground h-6 px-1.5 text-[11px] font-normal'
            size='xs'
            type='button'
            variant='ghost'
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? 'Hide' : 'Show'} {folded.length} more{' '}
            {folded.length === 1 ? 'notice' : 'notices'}
          </Button>
        )}
        {expanded
          ? folded.map((alert) => (
              <RuntimeAlert
                alert={alert}
                key={alert.id}
                onDismiss={dismiss}
                onSignIn={openSignIn}
              />
            ))
          : null}
      </div>
    </div>
  )
}

function RuntimeAlert({
  alert,
  onDismiss,
  onSignIn,
}: {
  readonly alert: ChatRuntimeAlert
  readonly onDismiss: (alert: ChatRuntimeAlert) => void
  readonly onSignIn: (target: NonNullable<ChatRuntimeAlert['signIn']>) => void
}) {
  const Icon = alert.tone === 'busy' ? Spinner : WarningCircleIcon
  const signIn = alert.signIn

  return (
    <Alert
      className={cn(runtimeAlertClass(alert.tone), 'rounded-md')}
      variant={alert.tone === 'error' ? 'destructive' : 'default'}
    >
      <Icon className='size-4' />
      <AlertTitle>{alert.title}</AlertTitle>
      {alert.detail ? (
        <AlertDescription className='line-clamp-3 tabular-nums' title={alert.detail}>
          {alert.detail}
        </AlertDescription>
      ) : null}
      {signIn || alert.dismissKey ? (
        <AlertAction className='flex items-center gap-1'>
          {signIn ? (
            <Button onClick={() => onSignIn(signIn)} size='xs' type='button' variant='outline'>
              Sign in
            </Button>
          ) : null}
          {alert.dismissKey ? (
            <Button
              aria-label={`Dismiss ${alert.title}`}
              className='size-6'
              onClick={() => onDismiss(alert)}
              size='icon-sm'
              type='button'
              variant='ghost'
            >
              <XIcon className='size-3.5' />
            </Button>
          ) : null}
        </AlertAction>
      ) : null}
    </Alert>
  )
}

function runtimeAlertClass(tone: ChatRuntimeAlertTone) {
  if (tone === 'warning') {
    return 'border-warning/30 bg-warning/10 text-warning'
  }
  if (tone === 'busy') return 'border-border/70 bg-card text-muted-foreground'

  return null
}
