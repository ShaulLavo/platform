import type { EnrichContext, LogLevel } from 'evlog'
import type { Elysia } from 'elysia'
import { evlog } from 'evlog/elysia'

import { isObservabilityActive } from './runtime'

export function applyObservability(app: Elysia) {
  if (!isObservabilityActive()) return

  app.use(
    evlog({
      enrich: applyHttpStatusLevel,
      exclude: ['/_log/ingest'],
    }),
  )
}

function applyHttpStatusLevel({ event, response }: EnrichContext) {
  event.level = httpStatusLevel(response?.status)
}

function httpStatusLevel(status: number | undefined): LogLevel {
  if (status !== undefined && status >= 500) return 'error'
  if (status !== undefined && status >= 400) return 'warn'

  return 'info'
}
