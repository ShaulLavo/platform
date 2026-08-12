import {
  modelRefKey,
  type ModelPreferences,
  type ModelRef,
  type ProviderSnapshot,
} from '@workspace/contracts'

export type ModelRow = {
  readonly hidden: boolean
  readonly key: string
  readonly ref: ModelRef
}

/**
 * Every model the providers report, plus any the user has an opinion about.
 *
 * Listing only the preferences was the defect: settings remember what you have
 * already decided, so the screen for deciding was empty until you had somehow
 * decided elsewhere. Hiding a model you can see in the picker was impossible
 * from the one place built to do it.
 *
 * Preferences still win where they exist — a hidden model keeps its row so it
 * can be brought back, including one whose provider is no longer reporting it,
 * which would otherwise become permanently hidden with no way to reach it.
 */
export function modelRows(
  preferences: ModelPreferences,
  snapshots: readonly ProviderSnapshot[] = [],
): ModelRow[] {
  const hidden = new Set(preferences.hidden.map((ref) => modelRefKey(ref)))
  const rows = new Map<string, ModelRow>()

  for (const ref of preferences.order) {
    rows.set(modelRefKey(ref), { hidden: hidden.has(modelRefKey(ref)), key: modelRefKey(ref), ref })
  }

  for (const snapshot of snapshots) {
    for (const model of snapshot.models) {
      const ref = { model: model.slug, providerInstanceId: snapshot.providerInstanceId }
      const key = modelRefKey(ref)
      if (rows.has(key)) continue

      rows.set(key, { hidden: hidden.has(key), key, ref })
    }
  }

  // Last, so a hidden model whose provider stopped listing it still has a row
  // to un-hide rather than disappearing while staying hidden forever.
  for (const ref of preferences.hidden) {
    const key = modelRefKey(ref)
    if (rows.has(key)) continue

    rows.set(key, { hidden: true, key, ref })
  }

  return Array.from(rows.values())
}
