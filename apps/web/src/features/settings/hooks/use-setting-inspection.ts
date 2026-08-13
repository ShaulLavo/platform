import {
  descriptorFor,
  inspectSetting,
  type SettingId,
  type SettingsSnapshot,
} from '@workspace/contracts'

import type { SettingsScope } from '../state/scope-store'

export type SettingInspection = {
  /** The value differs from the registry default. */
  readonly isModified: boolean
  /** Set in a layer other than the one being edited — the page has to say so. */
  readonly alsoModifiedIn: readonly string[]
  /** Non-null when this key cannot be written to the selected scope, with the reason. */
  readonly disabledReason: string | null
}

/**
 * What the page needs to render one row honestly: whether it differs from stock,
 * whether some *other* layer also sets it, and whether this scope may set it at
 * all.
 *
 * Computed on the client from the snapshot's per-layer `raw`, which is why the
 * snapshot carries unfiltered layers — a value dropped by scope is still
 * reported, so the page can say "set here, not applied" rather than showing
 * nothing and looking like the file was ignored.
 */
export function settingInspection(
  id: SettingId,
  snapshot: SettingsSnapshot,
  scope: SettingsScope,
): SettingInspection {
  const descriptor = descriptorFor(id)
  const inspection = inspectSetting(id, snapshot.layers, snapshot)
  const alsoModifiedIn = inspection.layers
    .filter((layer) => layer.layer !== scope)
    .map((layer) => layer.layer)

  return {
    alsoModifiedIn,
    disabledReason: writeBlockedReason(descriptor.scope, scope),
    isModified: JSON.stringify(snapshot.values[id]) !== JSON.stringify(descriptor.default),
  }
}

function writeBlockedReason(settingScope: string, target: SettingsScope): string | null {
  if (target === 'user') return null
  if (settingScope === 'window' || settingScope === 'resource') return null

  // The scope rule, stated where the user meets it. Workspace settings ship
  // inside a cloned repository, so anything reaching execution is user-only.
  return `${settingScope} settings can only be set in User settings`
}
