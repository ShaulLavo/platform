/**
 * The search buffer's addressable half, and only that half.
 *
 * `replaceText` and `replaceVisible` are absent by construction, not by omission: a
 * link that prefilled a bulk-replace field is one click from data loss. Results,
 * histories and collapsed paths are absent too — they re-run or they are tidying.
 *
 * `filtersVisible` IS carried, against the plan's classification of it as tidying:
 * `workspaceSearchQuery` zeroes both glob arrays when it is false, so a shared link
 * with globs would open with them visible-but-unapplied on a recipient whose panel
 * had filters hidden.
 */
export type AddressableSearch = {
  readonly caseSensitive?: boolean
  readonly excludeGlobText?: string
  readonly includeGlobText?: string
  readonly matchMode?: string
  readonly query?: string
  readonly wholeWord?: boolean
}

/** Structural on purpose: the live store and the cached record both satisfy it. */
export type SearchBufferFacts = {
  readonly caseSensitive: boolean
  readonly excludeGlobText: string
  readonly includeGlobText: string
  readonly matchMode: string
  readonly query: string
  readonly wholeWord: boolean
}

export function searchParamsFor(buffer: SearchBufferFacts | null) {
  if (!buffer?.query) return null

  const params: Record<string, string> = { q: buffer.query }
  if (buffer.matchMode && buffer.matchMode !== 'literal') params.m = buffer.matchMode
  if (buffer.caseSensitive) params.case = '1'
  if (buffer.wholeWord) params.word = '1'
  if (buffer.includeGlobText) params.in = buffer.includeGlobText
  if (buffer.excludeGlobText) params.x = buffer.excludeGlobText

  return params
}

const MATCH_MODES = new Set(['literal', 'regex', 'fuzzy'])

export function searchStateFor(
  params: Readonly<Record<string, string>> | null,
): AddressableSearch | null {
  if (!params?.q) return null

  return {
    caseSensitive: params.case === '1',
    excludeGlobText: params.x ?? '',
    includeGlobText: params.in ?? '',
    // A bogus mode used to reach the search request unvalidated and fail every query
    // for the workspace, then persist into its cached buffer.
    matchMode: MATCH_MODES.has(params.m ?? '') ? params.m : 'literal',
    query: params.q,
    wholeWord: params.word === '1',
  }
}
