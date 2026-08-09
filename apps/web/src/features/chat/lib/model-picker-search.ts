/**
 * Ranking for the model picker's search box.
 *
 * Lower score wins. Every query token must match at least one indexed field or
 * the option is rejected outright, so `gpt haiku` never surfaces a model that
 * only answers to `gpt`. Fields are indexed in priority order and each carries a
 * base penalty of `index * FIELD_PENALTY_STEP`, which is what makes a hit on the
 * model name beat an equally good hit on the provider's label.
 */

/** The projection this module indexes — `ProviderModelOption` satisfies it. */
export type ModelPickerSearchable = {
  readonly driverKind: string
  readonly name: string
  readonly providerLabel: string
  readonly shortName: string | null
}

// Field order is priority order: name, shortName, driverKind, providerLabel.
const FIELD_PENALTY_STEP = 10

// Match tiers, best to worst, applied on top of the field's base penalty.
const EXACT_OFFSET = 0
const PREFIX_OFFSET = 2
const BOUNDARY_OFFSET = 4
const INCLUDES_OFFSET = 6
const FUZZY_OFFSET = 100

// Subsequence matching on 1-2 char tokens matches nearly everything, so it is
// gated: short tokens must appear literally.
const MIN_FUZZY_TOKEN_LENGTH = 3
const BOUNDARY_MARKERS = [' ', '-', '_', '/'] as const
const MAX_LENGTH_PENALTY = 64

type RankedOption<T> = {
  option: T
  order: number
  score: number
}

export function rankModelPickerOptions<T extends ModelPickerSearchable>(
  options: readonly T[],
  query: string,
): T[] {
  const tokens = searchTokens(query)
  if (tokens.length === 0) return [...options]

  const ranked: RankedOption<T>[] = []
  for (const [order, option] of options.entries()) {
    const score = optionScore(option, tokens)
    if (score === null) continue

    ranked.push({ option, order, score })
  }

  // Ties keep the caller's order, which is the server's provider/model order.
  ranked.sort((left, right) => left.score - right.score || left.order - right.order)

  return ranked.map((entry) => entry.option)
}

function searchTokens(query: string): string[] {
  return normalize(query)
    .split(/\s+/u)
    .filter((token) => token.length > 0)
}

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function searchFields(option: ModelPickerSearchable): string[] {
  return [option.name, option.shortName ?? '', option.driverKind, option.providerLabel].map(
    normalize,
  )
}

function optionScore(option: ModelPickerSearchable, tokens: readonly string[]): number | null {
  const fields = searchFields(option)
  let total = 0

  for (const token of tokens) {
    const score = tokenScore(fields, token)
    if (score === null) return null

    total += score
  }

  return total
}

function tokenScore(fields: readonly string[], token: string): number | null {
  let best: number | null = null

  for (const [index, field] of fields.entries()) {
    const score = fieldTokenScore(field, token, index * FIELD_PENALTY_STEP)
    if (score === null) continue
    if (best !== null && score >= best) continue

    best = score
  }

  return best
}

function fieldTokenScore(field: string, token: string, fieldBase: number): number | null {
  if (!field) return null
  if (field === token) return fieldBase + EXACT_OFFSET
  if (field.startsWith(token)) return fieldBase + PREFIX_OFFSET + lengthPenalty(field, token)

  const boundaryIndex = boundaryMatchIndex(field, token)
  if (boundaryIndex !== null) {
    return fieldBase + BOUNDARY_OFFSET + boundaryIndex * 2 + lengthPenalty(field, token)
  }

  const includesIndex = field.indexOf(token)
  if (includesIndex !== -1) {
    return fieldBase + INCLUDES_OFFSET + includesIndex * 2 + lengthPenalty(field, token)
  }
  if (token.length < MIN_FUZZY_TOKEN_LENGTH) return null

  const fuzzy = subsequenceScore(field, token)
  if (fuzzy === null) return null

  return fieldBase + FUZZY_OFFSET + fuzzy
}

/** Index of `token` when it starts a word, preferring the earliest word. */
function boundaryMatchIndex(field: string, token: string): number | null {
  let best: number | null = null

  for (const marker of BOUNDARY_MARKERS) {
    const index = field.indexOf(`${marker}${token}`)
    if (index === -1) continue

    const matchIndex = index + marker.length
    if (best !== null && matchIndex >= best) continue

    best = matchIndex
  }

  return best
}

/** Penalises late starts, scattered characters and long fields. */
function subsequenceScore(field: string, token: string): number | null {
  let tokenIndex = 0
  let firstMatchIndex = -1
  let previousMatchIndex = -1
  let gapPenalty = 0

  for (let index = 0; index < field.length; index += 1) {
    if (field[index] !== token[tokenIndex]) continue
    if (firstMatchIndex === -1) firstMatchIndex = index
    if (previousMatchIndex !== -1) gapPenalty += index - previousMatchIndex - 1

    previousMatchIndex = index
    tokenIndex += 1
    if (tokenIndex < token.length) continue

    const spanPenalty = index - firstMatchIndex + 1 - token.length
    return firstMatchIndex * 2 + gapPenalty * 3 + spanPenalty + lengthPenalty(field, token)
  }

  return null
}

function lengthPenalty(field: string, token: string) {
  return Math.min(MAX_LENGTH_PENALTY, Math.max(0, field.length - token.length))
}
