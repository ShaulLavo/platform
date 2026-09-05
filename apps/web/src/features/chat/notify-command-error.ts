import { toast } from 'sonner'

import { errorMessage } from '@/lib/error-message'

/**
 * The rejection boundary for a chat command the UI does not await.
 *
 * `void transport.dispatchCommand(...)` attaches no rejection handler, so a
 * refused or timed-out command produced an unhandled rejection and nothing the
 * user could see — while the UI had already committed to the optimistic
 * outcome. Deliberately no log call: the RPC client already wraps every
 * dispatch in `observeClientOperation`, which emits the wide error event and
 * rethrows. This only surfaces what the log already recorded.
 */
export function notifyChatCommandError(error: unknown, title: string) {
  toast.error(title, {
    description: errorMessage(error, 'The server did not accept the change.'),
  })
}
