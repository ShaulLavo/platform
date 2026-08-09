import { modelRefKey, type ModelPreferences, type ModelRef } from '@workspace/contracts'

export type ModelRow = {
  readonly hidden: boolean
  readonly key: string
  readonly ref: ModelRef
}

/**
 * Settings only remember the models the user has an opinion about, so these are
 * the ordered ones first and the hidden ones after — not the provider's full
 * catalog, which the picker gets from the provider snapshot instead.
 */
export function modelRows(preferences: ModelPreferences): ModelRow[] {
  const rows = new Map<string, ModelRow>()

  for (const ref of preferences.order) {
    rows.set(modelRefKey(ref), { hidden: false, key: modelRefKey(ref), ref })
  }

  for (const ref of preferences.hidden) {
    rows.set(modelRefKey(ref), { hidden: true, key: modelRefKey(ref), ref })
  }

  return Array.from(rows.values())
}
