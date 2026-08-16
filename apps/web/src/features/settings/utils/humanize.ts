import { descriptorFor, type SettingId } from '@workspace/contracts'

/**
 * The name a row shows.
 *
 * The registry gets the first word: a handful of ids are shaped by how the value
 * is stored rather than by the choice being made, and `models.hidden` — a
 * denylist rendered as switches that are *on* for visible models — reads as a
 * contradiction under its own key name.
 */
export function settingRowTitle(id: SettingId): string {
  return descriptorFor(id).title ?? humanizeSettingId(id)
}

/**
 * `workbench.wallpaper.enabled` becomes "Wallpaper enabled".
 *
 * Drops only the top-level namespace, not everything before the last segment.
 * Taking just the leaf reads fine for `workbench.colorTheme` and turns
 * `workbench.wallpaper.enabled` into "Enabled", which says nothing — and the
 * generic leaves (`enabled`, `mode`, `size`) are exactly the ones that repeat
 * across namespaces.
 */
export function humanizeSettingId(id: string): string {
  const segments = id.split('.')
  const meaningful = segments.length > 1 ? segments.slice(1) : segments
  const spaced = meaningful
    .map((segment) => segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase())
    .join(' ')

  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
