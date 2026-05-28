import type { OrchestrationThreadActivity } from '@workspace/contracts'

export function visibleActivityGroupRows(
  activities: readonly OrchestrationThreadActivity[],
  maxRows: number,
) {
  if (maxRows <= 0) return []
  if (activities.length <= maxRows) return [...activities]

  const tail = activities.slice(-maxRows)
  if (tail.some((activity) => activity.tone === 'thinking')) return tail

  const latestThinking = activities.findLast((activity) => activity.tone === 'thinking')
  if (!latestThinking) return tail

  const selectedIds = new Set([latestThinking.id, ...tail.slice(1).map((activity) => activity.id)])
  return activities.filter((activity) => selectedIds.has(activity.id))
}
