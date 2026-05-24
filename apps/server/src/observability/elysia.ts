import type { Elysia } from 'elysia'
import { evlog } from 'evlog/elysia'

import { isObservabilityActive } from './runtime'

export function applyObservability(app: Elysia) {
  if (!isObservabilityActive()) return

  app.use(evlog())
}
