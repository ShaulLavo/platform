import type { ModelSelection, ModelSelectionOptions, ProviderModel } from '@workspace/contracts'

/** One reasoning level a model advertises, ready to render. */
export type ModelEffortLevel = {
  /** The provider's own copy for the level, when it ships one. */
  readonly description: string | null
  readonly effort: string
  readonly label: string
}

/**
 * The effort-relevant slice of a model. `ProviderModelOption` satisfies it
 * structurally, so the reconciler takes a picker row without this module having
 * to depend on the picker's own type.
 */
export type ModelEffortCapability = {
  readonly defaultEffort: string | null
  readonly effortLevels: readonly ModelEffortLevel[]
}

// Effort ids are open strings — Codex adds levels on its own schedule — so the
// label is derived, not looked up. The map only covers ids whose display form is
// not simply the id with a capital first letter.
const EFFORT_LABEL_OVERRIDES: Record<string, string> = { xhigh: 'X-High' }

/**
 * The levels a model actually advertises. A model that advertises none yields
 * none: the picker must never invent a level no provider offered.
 */
export function modelEffortLevels(model: ProviderModel): ModelEffortLevel[] {
  const advertised = model.capabilities?.reasoningEfforts ?? []

  return advertised.map((option) => ({
    description: effortDescription(option.description),
    effort: option.effort,
    label: modelEffortLabel(option.effort),
  }))
}

/**
 * The level the picker preselects. Only a default the model also advertises
 * counts — a default with no row to check is dead data, and rendering a row for
 * it would put a level on screen the provider never offered.
 */
export function modelDefaultEffort(model: ProviderModel): string | null {
  const fallback = model.capabilities?.defaultReasoningEffort ?? null
  if (!fallback) return null

  const advertised = model.capabilities?.reasoningEfforts ?? []

  return advertised.some((option) => option.effort === fallback) ? fallback : null
}

export function modelSelectionEffort(selection: ModelSelection | null | undefined): string | null {
  return selection?.options?.reasoningEffort ?? null
}

/**
 * Writes the level into the selection's options, which is the one home every
 * adapter reads and the per-thread projection already persists. `null` clears
 * it, and an options bag left empty is dropped rather than serialized.
 */
export function withModelEffort(selection: ModelSelection, effort: string | null): ModelSelection {
  const options = optionsWithoutEffort(selection.options)
  if (effort) options.reasoningEffort = effort

  const base = { model: selection.model, providerInstanceId: selection.providerInstanceId }
  if (Object.keys(options).length === 0) return base

  return { ...base, options }
}

/**
 * Carries the chosen level onto a newly picked model. A level the new model does
 * not advertise is never carried across — its own default takes over, and a
 * model that advertises nothing drops the level entirely. Choosing nothing stays
 * nothing: the adapters treat an absent level as "send no effort at all", so
 * preselecting a default here would silently start pinning it.
 */
export function reconcileModelEffort(
  previous: ModelSelection | null,
  next: ModelSelection,
  capability: ModelEffortCapability,
): ModelSelection {
  const current = modelSelectionEffort(previous)
  if (!current) return withModelEffort(next, null)
  if (capability.effortLevels.some((level) => level.effort === current)) {
    return withModelEffort(next, current)
  }

  return withModelEffort(next, capability.defaultEffort)
}

export function modelEffortLabel(effort: string): string {
  const override = EFFORT_LABEL_OVERRIDES[effort]
  if (override) return override

  return effort.charAt(0).toUpperCase() + effort.slice(1)
}

function effortDescription(description: string | undefined): string | null {
  const trimmed = description?.trim() ?? ''
  if (!trimmed) return null

  return trimmed
}

function optionsWithoutEffort(options: ModelSelectionOptions | undefined): ModelSelectionOptions {
  if (!options) return {}

  // Every other key belongs to some adapter, so the bag is copied whole and only
  // the one key we own is removed.
  const rest = { ...options }
  delete rest.reasoningEffort

  return rest
}
