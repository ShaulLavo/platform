const areas = ['search', 'list', 'details', 'diagnostics'] as const
export type SettingsFocus = (typeof areas)[number]

export function nextFocus(
  current: SettingsFocus,
  reverse: boolean,
  hasDiagnostics = false,
): SettingsFocus {
  const available = areas.filter((area) => hasDiagnostics || area !== 'diagnostics')
  const step = reverse ? -1 : 1
  return available[(available.indexOf(current) + step + available.length) % available.length]
}
