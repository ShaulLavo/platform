import type { EnvironmentEntry } from '@/lib/environments/utils/connection'
import type { AddressEnvironments } from '@/features/address/utils/grammar'

export function addressEnvironments(
  entries: Readonly<Record<string, EnvironmentEntry>>,
): AddressEnvironments {
  const values = Object.values(entries)
  return {
    knownEnvironmentIds: values.flatMap((entry) => entry.environmentId ?? []),
    primaryEnvironmentId: values.find((entry) => entry.kind === 'primary')?.environmentId ?? null,
  }
}
