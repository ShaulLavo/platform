import type { ThreadStatus } from '@/features/chat/lib/thread-status'

/**
 * Most urgent first. A project header answers one question — is anything in here
 * asking for me — so the worst state among its sessions is the only one worth a dot.
 */
const ROLLUP_ORDER: readonly ThreadStatus[] = ['waiting', 'failed', 'working', 'idle']

export function rollupThreadStatus(statuses: readonly ThreadStatus[]): ThreadStatus {
  for (const status of ROLLUP_ORDER) {
    if (statuses.includes(status)) return status
  }

  return 'idle'
}
