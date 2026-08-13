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
