import { toast } from 'sonner'

import { toClientError } from '@/lib/client-error-taxonomy'
import { reportClientError } from '@/lib/client-error-reporting'

export function notifyMutationError(error: unknown) {
  const clientError = toClientError(error)

  reportClientError({
    area: 'git',
    category: clientError.category,
    cause: clientError.cause,
    message: clientError.message,
    operation: 'mutation',
  })

  if (clientError.category === 'unknown') return

  toast.error('Git command failed', {
    description: clientError.message,
  })
}
