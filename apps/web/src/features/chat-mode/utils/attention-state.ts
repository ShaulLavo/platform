import type { SessionAttentionState } from '@workspace/contracts'

export function sessionStatusLabel(status: SessionAttentionState) {
  if (status === 'needs-input') return 'Waiting for you'
  if (status === 'working') return 'Working'

  return 'Settled'
}

/** Token classes only — these flip with the theme and must never be palette hues. */
export function sessionStatusDotClass(status: SessionAttentionState) {
  if (status === 'needs-input') return 'bg-warning'
  if (status === 'working') return 'bg-info'

  return 'bg-muted-foreground/40'
}

export function sessionStatusTextClass(status: SessionAttentionState) {
  if (status === 'needs-input') return 'text-warning'
  if (status === 'working') return 'text-info'

  return 'text-muted-foreground'
}
