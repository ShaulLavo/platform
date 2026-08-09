import { modelEffortLabel } from '@/features/chat/lib/model-effort'
import type { ProviderModelOption } from '@/features/chat/lib/provider-model-options'

/** One chip on a picker row. `title` is the hover text; the label is the chip. */
export type ModelPickerBadge = {
  readonly key: string
  readonly label: string
  readonly title: string
}

/**
 * Models worth flagging as newly added, keyed `driverKind:slug`. A hand-kept set
 * because no provider tells us a release date: the snapshot carries a slug, a
 * name and capabilities, and nothing that orders two models in time. Codex pages
 * its catalog live, so only the hardcoded Claude catalog can be flagged here.
 * Emptying this set is the correct edit once a model stops being news.
 */
const NEW_MODEL_KEYS = new Set<string>(['claude:claude-opus-5', 'claude:claude-opus-5[1m]'])

/** Two chips is what a 360px row can carry without the model name truncating. */
const MAX_ROW_BADGES = 2

export function isNewProviderModel(option: ProviderModelOption): boolean {
  return NEW_MODEL_KEYS.has(`${option.driverKind}:${option.modelSelection.model}`)
}

/**
 * The metadata chips for one row, most specific first. The reasoning level is
 * passed in rather than read off the option because only the selected row has
 * one: it is the level the composer will actually send, not a property of the
 * model, and showing it on every row would state a level nobody chose.
 */
export function modelPickerRowBadges(
  option: ProviderModelOption,
  activeEffort: string | null,
): ModelPickerBadge[] {
  const badges: ModelPickerBadge[] = []
  if (activeEffort) {
    const label = modelEffortLabel(activeEffort)
    badges.push({ key: 'effort', label, title: `${label} reasoning effort` })
  }
  if (option.isCustom) {
    badges.push({ key: 'custom', label: 'Custom', title: 'Model added by your configuration' })
  }
  if (option.supportsThinking) {
    badges.push({ key: 'thinking', label: 'Thinks', title: 'Supports extended thinking' })
  }

  return badges.slice(0, MAX_ROW_BADGES)
}
