import type { DiffFilePosition } from '@/features/editor/utils/diff-position-map'

/**
 * What `textDocument/definition` can answer with.
 *
 * Three shapes for one question, all of them legal: a single `Location`, an array of them, or an
 * array of `LocationLink`s, which name the range differently again. A server picks one and never
 * says which, so a reader that handles only the shape it happened to meet first works until the day
 * the project's server changes.
 */
export type DefinitionResponse = DefinitionLocation | readonly DefinitionAnswer[] | null

type DefinitionAnswer = DefinitionLocation | DefinitionLink

type DefinitionLocation = {
  readonly uri: string
  readonly range: DefinitionRange
}

type DefinitionLink = {
  readonly targetUri: string
  readonly targetSelectionRange?: DefinitionRange
  readonly targetRange: DefinitionRange
}

type DefinitionRange = {
  readonly start: DiffFilePosition
  readonly end: DiffFilePosition
}

/**
 * The first definition, normalized.
 *
 * First rather than a choice among them: a server that returns several is offering overloads or
 * merged declarations, and every editor opens the first. `targetSelectionRange` wins over
 * `targetRange` where both exist — the former is the identifier, the latter its whole body, and
 * landing on the name is what a reader asked for.
 */
export function firstDefinitionLocation(
  response: DefinitionResponse,
): { readonly uri: string; readonly range: DefinitionRange } | null {
  if (!response) return null
  if (!Array.isArray(response)) return asLocation(response as DefinitionAnswer)

  const first = (response as readonly DefinitionAnswer[])[0]

  return first ? asLocation(first) : null
}

function asLocation(answer: DefinitionAnswer) {
  if ('uri' in answer) return { range: answer.range, uri: answer.uri }

  return {
    range: answer.targetSelectionRange ?? answer.targetRange,
    uri: answer.targetUri,
  }
}
