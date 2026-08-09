import { useQuery } from '@tanstack/react-query'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'
import { CircleNotchIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useMemo } from 'react'

import {
  chatRuntimeAlerts,
  type ChatCommandState,
  type ChatRuntimeAlertTone,
} from '../lib/chat-runtime-state'
import { errorMessage } from '@/lib/error-message'
import { useProviderSignInDialog } from '../hooks/use-provider-sign-in-dialog'
import { providerListQueryOptions } from '../lib/provider-query'
import type { ChatThread } from '../state/chat-projection-store'

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
  const provider = providersQuery.data?.providers.find(
    (candidate) => candidate.providerInstanceId === thread.modelSelection.providerInstanceId,
  )
  const providerError = providersQuery.error
    ? errorMessage(providersQuery.error, 'Provider request failed.')
    : null
  const commandState = useMemo(
    () => ({ commandFailure, interruptPending, sendPending, stopPending }),
    [commandFailure, interruptPending, sendPending, stopPending],
  )
  const alerts = useMemo(
    () =>
      chatRuntimeAlerts({
        commandState,
        provider,
        providerError,
        providerLoading: providersQuery.isLoading,
        thread,
      }),
    [commandState, provider, providerError, providersQuery.isLoading, thread],
  )

  if (alerts.length === 0) return null

  return (
    <div aria-label='Runtime notices' className='shrink-0 px-3 pt-3' role='status'>
      <div className='mx-auto max-w-3xl space-y-2'>
        {alerts.map((alert) => {
          const Icon = alert.tone === 'busy' ? CircleNotchIcon : WarningCircleIcon
          const signIn = alert.signIn

          return (
            <Alert
              className={cn(runtimeAlertClass(alert.tone), 'rounded-md')}
              key={alert.id}
              variant={alert.tone === 'error' ? 'destructive' : 'default'}
            >
              <Icon className={cn('size-4', alert.tone === 'busy' && 'animate-spin')} />
              <AlertTitle>{alert.title}</AlertTitle>
              {alert.detail ? (
                <AlertDescription className='line-clamp-3 tabular-nums' title={alert.detail}>
                  {alert.detail}
                </AlertDescription>
              ) : null}
              {signIn ? (
                <AlertAction>
                  <Button
                    onClick={() => openSignIn(signIn)}
                    size='xs'
                    type='button'
                    variant='outline'
                  >
                    Sign in
                  </Button>
                </AlertAction>
              ) : null}
            </Alert>
          )
        })}
      </div>
    </div>
  )
}

function runtimeAlertClass(tone: ChatRuntimeAlertTone) {
  if (tone === 'warning') {
    return 'border-warning/30 bg-warning/10 text-warning'
  }
  if (tone === 'busy') return 'border-border/70 bg-card text-muted-foreground'

  return null
}
