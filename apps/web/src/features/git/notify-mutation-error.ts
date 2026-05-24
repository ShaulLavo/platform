import { toast } from 'sonner'

import { toClientError } from '@/lib/client-error-taxonomy'

export function notifyMutationError(error: unknown) {
  const clientError = toClientError(error)

  console.error('[notify-mutation-error]', {
    category: clientError.category,
    message: clientError.message,
    cause: clientError.cause,
  })

  if (clientError.category === 'unknown') return

  toast.error('Git command failed', {
    description: clientError.message,
  })
}
