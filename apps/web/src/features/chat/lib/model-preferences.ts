import { modelRefKey, type ModelRef } from '@workspace/contracts'

import type { ProviderModelOption } from './provider-model-options'

export type ModelPreferences = {
  readonly hidden: readonly ModelRef[]
  readonly order: readonly ModelRef[]
}

/**
 * Applies the user's model preferences to a provider's options.
 *
 * Both lists are sparse — they name only the models the user has an opinion
 * about — so everything unmentioned stays visible, after the ordered ones, in
 * the order the provider advertised. That is the contract the schema has always
 * documented; until now nothing applied it, so hiding a model did nothing.
 */
export function applyModelPreferences(
  options: readonly ProviderModelOption[],
  preferences: ModelPreferences,
): ProviderModelOption[] {
  const hidden = new Set(preferences.hidden.map(modelRefKey))
  const visible = options.filter((option) => !hidden.has(modelRefKey(option.modelSelection)))
  if (preferences.order.length === 0) return visible

  const rank = new Map(preferences.order.map((ref, index) => [modelRefKey(ref), index]))

  // A stable partition rather than a sort over the whole list: unranked models
  // must keep provider order exactly, and a comparator that invents a rank for
  // them would quietly reorder a provider's own preferred sequence.
  const ranked = visible
    .filter((option) => rank.has(modelRefKey(option.modelSelection)))
    .sort(
      (left, right) =>
        (rank.get(modelRefKey(left.modelSelection)) ?? 0) -
        (rank.get(modelRefKey(right.modelSelection)) ?? 0),
    )
  const rest = visible.filter((option) => !rank.has(modelRefKey(option.modelSelection)))

  return [...ranked, ...rest]
}

/**
 * The models a provider actually advertises, as rows the settings page can show.
 *
 * Sourced from the provider catalogue rather than from the preferences, which is
 * the fix that makes the Models section possible at all: deriving rows from
 * `hidden`/`order` meant the list could only ever contain models the user had
 * already acted on, so it started empty and stayed empty.
 */
export function modelPreferenceRows(
  options: readonly ProviderModelOption[],
  preferences: ModelPreferences,
) {
  const hidden = new Set(preferences.hidden.map(modelRefKey))

  return options.map((option) => ({
    hidden: hidden.has(modelRefKey(option.modelSelection)),
    key: option.key,
    label: option.label,
    providerLabel: option.providerLabel,
    ref: option.modelSelection,
  }))
}
