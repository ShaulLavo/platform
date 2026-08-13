import type { ProviderInstanceConfig, ProviderSnapshot } from '@workspace/contracts'

/**
 * Every provider the app is actually running, as a configurable row.
 *
 * The section used to list the settings document, which is empty on a fresh
 * install — the built-in instances live in the registry as constants, not as
 * saved rows. So the one screen for configuring providers showed "No provider
 * instances configured yet" while two providers were running behind it.
 *
 * Snapshots are the source of what exists; saved entries supply the
 * configuration where there is one. A saved instance whose driver failed to
 * materialize still gets a row, or disabling something broken would make the
 * only control for re-enabling it disappear.
 */
export function providerSettingRows({
  saved,
  snapshots,
}: {
  readonly saved: readonly ProviderInstanceConfig[]
  readonly snapshots: readonly ProviderSnapshot[]
}): ProviderInstanceConfig[] {
  const savedById = new Map(saved.map((entry) => [entry.providerInstanceId, entry]))
  const rows = snapshots.map(
    (snapshot) => savedById.get(snapshot.providerInstanceId) ?? configFromSnapshot(snapshot),
  )
  const listed = new Set(snapshots.map((snapshot) => snapshot.providerInstanceId))

  return rows.concat(saved.filter((entry) => !listed.has(entry.providerInstanceId)))
}

/**
 * The row for a provider with no saved overrides. Everything the user has not
 * set stays at the driver's own default, which is what the server would fall
 * back to anyway — writing anything else here would save settings the user
 * never chose the moment they flipped one switch.
 */
function configFromSnapshot(snapshot: ProviderSnapshot): ProviderInstanceConfig {
  return {
    binaryPath: '',
    config: {},
    displayLabel: snapshot.displayLabel,
    driverKind: snapshot.driverKind,
    enabled: snapshot.enabled,
    environment: [],
    providerInstanceId: snapshot.providerInstanceId,
  }
}
