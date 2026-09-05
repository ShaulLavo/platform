import { eventLogContext } from '@/lib/environments/state/log-context'
import {
  createWideEventScope as createScope,
  type WideEventBase,
} from '@workspace/observability/scope'

import { clientLoggingEnabled } from '@/lib/client-logging'

export function createWideEventScope(base: WideEventBase) {
  return createScope({
    enabled: clientLoggingEnabled(),
    base: { ...eventLogContext(base), ...base, runtime: 'browser' },
  })
}
