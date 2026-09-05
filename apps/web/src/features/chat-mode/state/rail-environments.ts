import {
  useChatProjectionStore,
  type ChatProjectionState,
} from '@/features/chat/state/chat-projection-store'
import { useEnvironmentsStore, type EnvironmentsState } from '@/lib/environments/state/store'
import type { SessionRailEnvironment } from '@/features/chat-mode/utils/session-rail-model'

export function railEnvironments(
  projection: ChatProjectionState,
  environments: EnvironmentsState,
): readonly SessionRailEnvironment[] {
  const byIdentity = new Map<SessionRailEnvironment['environmentId'], SessionRailEnvironment>()
  for (const entry of Object.values(environments.entries)) {
    if (!entry.environmentId) continue
    const slice = projection.slices[entry.environmentId]
    if (!slice) continue
    if (byIdentity.has(entry.environmentId) && entry.kind !== 'primary') continue
    byIdentity.set(entry.environmentId, {
      environmentId: entry.environmentId,
      label: entry.label,
      isPrimary: entry.kind === 'primary',
      slice,
    })
  }
  return [...byIdentity.values()]
}
export function currentRailEnvironments() {
  return railEnvironments(useChatProjectionStore.getState(), useEnvironmentsStore.getState())
}
