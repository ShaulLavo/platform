/**
 * Returns true when both arrays have the same length and every pair of
 * elements at the same index is `Object.is`-equal. Object elements compare
 * by identity, which makes this a fit for store-selector equality checks.
 */
export function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  if (left === right) return true
  if (left.length !== right.length) return false

  return left.every((value, index) => Object.is(value, right[index]))
}
