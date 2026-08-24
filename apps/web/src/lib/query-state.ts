import type { Query } from '@tanstack/react-query'

/** A fetch that has no answer to keep drawing is resolving an input, not refreshing one. */
export function queryHasNoData(query: Query): boolean {
  return query.state.data === undefined
}
