import type { ProviderInstanceId } from '@workspace/contracts'

/**
 * The instance list the registry should run, given what the user has saved.
 *
 * Saved entries *layer over* the built-in ones rather than replacing them.
 * Replacing would mean an empty settings document — which is what every install
 * starts with, and what a single bad write would leave behind — reconciles the
 * registry down to zero providers and the app can talk to nothing. Layering
 * makes the defaults the floor: the worst a settings document can do is change
 * or add, never silently remove the only way to reach a model.
 *
 * A saved entry wins by `providerInstanceId`, which is what lets the user
 * disable a built-in or point it at a different binary. Order follows the
 * defaults first, then additions in the order they were saved, because that
 * order is what the provider picker shows.
 */
export function mergeProviderInstanceConfigs<
  Config extends { readonly providerInstanceId: ProviderInstanceId },
>(defaults: readonly Config[], saved: readonly Config[]): Config[] {
  const savedById = new Map(saved.map((entry) => [entry.providerInstanceId, entry]))
  const merged = defaults.map((entry) => savedById.get(entry.providerInstanceId) ?? entry)
  const defaultIds = new Set(defaults.map((entry) => entry.providerInstanceId))

  return merged.concat(saved.filter((entry) => !defaultIds.has(entry.providerInstanceId)))
}
