import { DEFAULT_SETTING_VALUES, type SettingId, type SettingsValues } from '@workspace/contracts'

/**
 * Whether a value the page just built is the registry default again.
 *
 * What it buys is the difference between a key that is absent and a key that is
 * present holding the default. Both resolve to the same value, but only the
 * second makes the row say "modified" and offer a Reset that changes nothing —
 * so an edit that lands here has to drop the key rather than write it.
 */
export function isDefaultValue<K extends SettingId>(key: K, value: SettingsValues[K]): boolean {
  return jsonEqual(value, DEFAULT_SETTING_VALUES[key])
}

/**
 * Structural equality for settings values, which are always JSON.
 *
 * Order-insensitive across object keys and order-*sensitive* across arrays, both
 * deliberately: a record is the same record however it was serialised, and
 * `models.order` is a list whose whole meaning is its order.
 */
function jsonEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (typeof left !== 'object' || typeof right !== 'object') return false
  if (left === null || right === null) return false

  if (Array.isArray(left) || Array.isArray(right)) return arrayEqual(left, right)

  return recordEqual(left as Record<string, unknown>, right as Record<string, unknown>)
}

function arrayEqual(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right)) return false
  if (left.length !== right.length) return false

  return left.every((entry, index) => jsonEqual(entry, right[index]))
}

function recordEqual(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false

  return keys.every((key) => Object.hasOwn(right, key) && jsonEqual(left[key], right[key]))
}
