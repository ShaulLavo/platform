import type { EnvironmentEntry } from '@workspace/client-core/environments/utils/connection'
import type { AddressEnvironments } from '@workspace/client-core/address/grammar'

export function addressEnvironments(
  entries: Readonly<Record<string, EnvironmentEntry>>,
): AddressEnvironments {
  const values = Object.values(entries)
  return {
    knownEnvironmentIds: values.flatMap((entry) => entry.environmentId ?? []),
    primaryEnvironmentId: values.find((entry) => entry.kind === 'primary')?.environmentId ?? null,
  }
}
