import {
  descriptorFor,
  inspectSetting,
  layerAllowsScope,
  SETTINGS_LAYER_ORDER,
  type SettingId,
  type SettingInspection as SettingInspectionResult,
  type SettingScope,
  type SettingsLayerId,
  type SettingsSnapshot,
} from '@workspace/contracts'

import type { SettingsScope } from '../state/scope-store'

export type SettingInspection = {
  /**
   * The layer being edited sets this key.
   *
   * About the layer, not about the resolved document: the marker sits next to a
   * Reset that removes the key from *this* file, so anything else lights it up
   * for a scope where reset has nothing to remove.
   */
  readonly isModified: boolean
  /** Set in a layer other than the one being edited — the page has to say so. */
  readonly alsoModifiedIn: readonly string[]
  /**
   * A layer above this one already decides the value, so a write here changes
   * the file and nothing else.
   *
   * Without it the control appears to do nothing: the user edits, the row
   * re-renders from the resolved document, and the number they just typed is
   * gone with no error to explain it.
   */
  readonly overriddenBy: SettingsLayerId | null
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
    isModified: inspection.layers.some((layer) => layer.layer === scope),
    overriddenBy: overridingLayer(inspection.effectiveLayer, scope),
  }
}

/** The winning layer, when it sits above the one being edited. */
function overridingLayer(
  effectiveLayer: SettingInspectionResult['effectiveLayer'],
  scope: SettingsScope,
): SettingsLayerId | null {
  if (effectiveLayer === 'default') return null

  const rank = (layer: SettingsLayerId) => SETTINGS_LAYER_ORDER.indexOf(layer)

  return rank(effectiveLayer) > rank(scope) ? effectiveLayer : null
}

function writeBlockedReason(settingScope: SettingScope, target: SettingsScope): string | null {
  if (layerAllowsScope(target, settingScope)) return null

  // The scope rule, stated where the user meets it. Workspace settings ship
  // inside a cloned repository, so anything reaching execution is user-only.
  return `${settingScope} settings can only be set in User settings`
}
