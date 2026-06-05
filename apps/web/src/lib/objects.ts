/**
 * Returns a shallow copy of `values` with every `null` or `undefined` entry
 * removed. Useful for building request bodies where a key should be absent
 * rather than sent as an explicit null/undefined.
 */
export function omitNullish<T extends object>(
  values: T,
): { [K in keyof T]?: NonNullable<T[K]> } {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== null),
  ) as { [K in keyof T]?: NonNullable<T[K]> }
}
