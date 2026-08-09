import { toast } from 'sonner'

import { reportClientError } from '@/lib/client-error-reporting'
import { toClientError } from '@/lib/client-error-taxonomy'

export function notifySaveError(error: unknown) {
  const clientError = toClientError(error)

  reportClientError({
    area: 'settings',
    category: clientError.category,
    cause: clientError.cause,
    message: clientError.message,
    operation: 'mutation',
  })

  if (clientError.category === 'unknown') return

  toast.error('Could not save settings', { description: clientError.message })
}
