import {
  logEventDetailSchema,
  logEventsResultSchema,
  logDashboardSummarySchema,
  logLiveStreamItemSchema,
  type LogDashboardFilters,
  type LogEventDetail,
  type LogEventsResult,
  type LogDashboardSummary,
  type LogLiveStreamItem,
} from '@workspace/contracts'
import * as v from 'valibot'

import { client } from '@/lib/client'
import { parseEdenSseStream, unwrapEdenResponse } from '@/lib/eden-events'
import { clientErrors, createRpcError } from '@/lib/structured-errors'
import { logFilterQuery } from './log-filter-params'

export async function fetchLogSummary(
  filters: LogDashboardFilters,
  signal?: AbortSignal,
): Promise<LogDashboardSummary> {
  const response = await client._log.dashboard.summary.get({
    fetch: { signal },
    query: logFilterQuery(filters),
  })

  return v.parse(logDashboardSummarySchema, unwrapEdenResponse(response, { normalizeSse: true }))
}

export async function fetchLogEvents(
  filters: LogDashboardFilters,
  signal?: AbortSignal,
): Promise<LogEventsResult> {
  const response = await client._log.dashboard.events.get({
    fetch: { signal },
    query: {
      ...logFilterQuery(filters),
      limit: 300,
    },
  })

  return v.parse(logEventsResultSchema, unwrapEdenResponse(response, { normalizeSse: true }))
}

export async function fetchLogEventDetail(
  id: string,
  signal?: AbortSignal,
): Promise<LogEventDetail> {
  const response = await client._log.dashboard.event.get({
    fetch: { signal },
    query: { id },
  })

  return v.parse(logEventDetailSchema, unwrapEdenResponse(response, { normalizeSse: true }))
}

export async function* subscribeLogEvents(
  filters: LogDashboardFilters,
  signal?: AbortSignal,
): AsyncGenerator<LogLiveStreamItem> {
  const response = await client._log.dashboard.live.get({
    fetch: { signal },
    query: logFilterQuery(filters),
  })
  if (response.error) throw createRpcError(response.error)
  if (!response.data) throw clientErrors.EDEN_STREAM_MISSING({ label: 'Logs stream' })

  for await (const event of parseEdenSseStream(response.data)) {
    if (event.event === 'heartbeat') continue

    yield v.parse(logLiveStreamItemSchema, event.data)
  }
}
