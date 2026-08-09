import type { OrchestrationThreadActivity } from '@workspace/contracts'
import * as v from 'valibot'

/**
 * Providers report context occupancy as a `context-window.updated` activity whose
 * payload is the adapter's own usage snapshot. This is the one place that shape is
 * read, so a provider that omits a field degrades the gauge instead of the thread.
 */
export const CONTEXT_WINDOW_ACTIVITY_KIND = 'context-window.updated'

const nonNegativeNumber = v.pipe(v.number(), v.minValue(0))

const tokenUsagePayloadSchema = v.object({
  cachedInputTokens: v.optional(nonNegativeNumber),
  /** Codex compacts on its own, so a used-token count that drops is expected. */
  compactsAutomatically: v.optional(v.boolean()),
  inputTokens: v.optional(nonNegativeNumber),
  maxTokens: v.optional(nonNegativeNumber),
  outputTokens: v.optional(nonNegativeNumber),
  reasoningOutputTokens: v.optional(nonNegativeNumber),
  totalProcessedTokens: v.optional(nonNegativeNumber),
  usedTokens: v.optional(nonNegativeNumber),
})

export type ContextUsage = {
  readonly compactsAutomatically: boolean
  readonly maxTokens: number
  /** 0–1, clamped: a provider that over-reports must not paint past a full ring. */
  readonly ratio: number
  readonly totalProcessedTokens: number | null
  readonly usedTokens: number
}

/**
 * The newest usable snapshot in the thread. Activities arrive oldest-first, and a
 * provider can emit a snapshot without a window size (Claude's per-turn result
 * usage does), so the scan takes the last one that carries both numbers rather than
 * the last one outright.
 */
export function contextUsageForActivities(
  activities: readonly OrchestrationThreadActivity[],
): ContextUsage | null {
  for (let index = activities.length - 1; index >= 0; index -= 1) {
    const activity = activities[index]
    if (activity?.kind !== CONTEXT_WINDOW_ACTIVITY_KIND) continue

    const usage = contextUsageForPayload(activity.payload)
    if (usage) return usage
  }

  return null
}

export function contextUsageForPayload(payload: unknown): ContextUsage | null {
  const parsed = v.safeParse(tokenUsagePayloadSchema, payload)
  if (!parsed.success) return null

  const { compactsAutomatically, maxTokens, totalProcessedTokens, usedTokens } = parsed.output
  if (!maxTokens) return null
  if (usedTokens === undefined) return null

  return {
    compactsAutomatically: compactsAutomatically ?? false,
    maxTokens,
    ratio: Math.min(1, usedTokens / maxTokens),
    totalProcessedTokens: totalProcessedTokens ?? null,
    usedTokens,
  }
}

export function formatContextTokens(tokens: number) {
  if (tokens < 1000) return `${tokens}`
  if (tokens < 1_000_000) return `${roundedTo(tokens / 1000, 1)}k`

  return `${roundedTo(tokens / 1_000_000, 1)}M`
}

export function contextUsageTone(ratio: number) {
  if (ratio >= 0.9) return 'destructive' as const
  if (ratio >= 0.7) return 'warning' as const

  return 'muted' as const
}

function roundedTo(value: number, decimals: number) {
  const factor = 10 ** decimals
  const rounded = Math.round(value * factor) / factor

  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(decimals)
}
