import type { ProviderSkill } from '@workspace/contracts'

/**
 * Ranking for the composer's `/command` and `$skill` menus.
 *
 * Lower score wins. Every query token must match at least one indexed field or
 * the candidate is rejected outright, so `review file` never surfaces a command
 * that only answers to `review`. Fields are indexed in priority order and each
 * carries a base penalty of `index * FIELD_PENALTY_STEP` — that is what makes a
 * weak hit on the command's name beat a perfect hit on its description.
 *
 * The tiers never bleed into each other. Every penalty layered on top of a tier
 * is capped, and the caps are chosen so the worst score inside one tier still
 * beats the best score in the next: a prefix match always outranks a boundary
 * match, which always outranks a mid-word substring, which always outranks a
 * scattered subsequence. The same reasoning one level up keeps a bad hit on a
 * high-priority field ahead of a perfect hit on a low-priority one.
 */

/** Field order is priority order: name, aliases, description, argument hint. */
const FIELD_PENALTY_STEP = 200

// Match tiers, best to worst, applied on top of the field's base penalty. Each
// is one TIER_STEP apart, and TIER_STEP exceeds MAX_TIER_PENALTY.
const EXACT_OFFSET = 0
const PREFIX_OFFSET = 20
const BOUNDARY_OFFSET = 40
const INCLUDES_OFFSET = 60
const FUZZY_OFFSET = 120

// Subsequence matching on 1-2 character tokens matches nearly everything, so it
// is gated: short tokens have to appear literally.
const MIN_FUZZY_TOKEN_LENGTH = 3
const BOUNDARY_MARKERS = [' ', '-', '_', '/', ':', '.'] as const
const MAX_POSITION_PENALTY = 8
const MAX_LENGTH_PENALTY = 16
// Fuzzy detail is the one unbounded term (gaps and span grow with the field), so
// it is clamped to keep the worst fuzzy score inside this field below the next
// field's base penalty.
const MAX_FUZZY_PENALTY = 60

/** Leading trigger characters are the menu's, not part of what the user typed. */
const TRIGGER_PREFIX = /^[/$]+/

/** The projection this module indexes. `ProviderSlashCommand` satisfies it. */
export type ComposerCommandSearchable = {
  readonly aliases?: readonly string[]
  readonly argumentHint?: string
  readonly description?: string
  readonly name: string
}

type Ranked<T> = {
  item: T
  order: number
  score: number
}

/**
 * Ranked `/command` matches. An empty query keeps the provider's own order,
 * which is the order the CLI advertised them in.
 */
export function searchComposerCommands<T extends ComposerCommandSearchable>(
  commands: readonly T[],
  query: string,
  limit = Number.POSITIVE_INFINITY,
): T[] {
  return rankComposerMatches(commands, query, commandSearchFields, limit)
}

/**
 * Ranked `$skill` matches. Disabled skills are dropped rather than ranked last:
 * committing one would put a name in the prompt the provider will not resolve.
 */
export function searchComposerSkills<T extends ProviderSkill>(
  skills: readonly T[],
  query: string,
  limit = Number.POSITIVE_INFINITY,
): T[] {
  return rankComposerMatches(
    skills.filter((skill) => skill.enabled),
    query,
    skillSearchFields,
    limit,
  )
}

/**
 * The shared ranker. `fieldsOf` returns the candidate's indexed text in
 * priority order; blanks are allowed and never match.
 */
function rankComposerMatches<T>(
  items: readonly T[],
  query: string,
  fieldsOf: (item: T) => readonly (string | null | undefined)[],
  limit = Number.POSITIVE_INFINITY,
): T[] {
  const tokens = searchTokens(query)
  if (tokens.length === 0) return items.slice(0, boundedLimit(limit))

  const ranked: Ranked<T>[] = []
  for (const [order, item] of items.entries()) {
    const score = itemScore(fieldsOf(item), tokens)
    if (score === null) continue

    ranked.push({ item, order, score })
  }

  // Ties keep the caller's order, so equal scores never reshuffle between
  // keystrokes and the menu's active row stays where the user left it.
  ranked.sort((left, right) => left.score - right.score || left.order - right.order)

  return ranked.slice(0, boundedLimit(limit)).map((entry) => entry.item)
}

function boundedLimit(limit: number) {
  if (!Number.isFinite(limit)) return undefined

  return Math.max(0, Math.floor(limit))
}

function commandSearchFields(command: ComposerCommandSearchable) {
  return [
    command.name,
    (command.aliases ?? []).join(' '),
    command.description,
    command.argumentHint,
  ]
}

function skillSearchFields(skill: ProviderSkill) {
  return [skill.name, skill.description, skill.scope, skill.path]
}

function searchTokens(query: string): string[] {
  return normalize(query.replace(TRIGGER_PREFIX, ''))
    .split(/\s+/u)
    .filter((token) => token.length > 0)
}

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function itemScore(
  fields: readonly (string | null | undefined)[],
  tokens: readonly string[],
): number | null {
  const normalized = fields.map((field) => normalize(field ?? ''))
  let total = 0

  for (const token of tokens) {
    const score = tokenScore(normalized, token)
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
    return (
      fieldBase + BOUNDARY_OFFSET + positionPenalty(boundaryIndex) + lengthPenalty(field, token)
    )
  }

  const includesIndex = field.indexOf(token)
  if (includesIndex !== -1) {
    return (
      fieldBase + INCLUDES_OFFSET + positionPenalty(includesIndex) + lengthPenalty(field, token)
    )
  }
  if (token.length < MIN_FUZZY_TOKEN_LENGTH) return null

  const fuzzy = subsequenceScore(field, token)
  if (fuzzy === null) return null

  return fieldBase + FUZZY_OFFSET + fuzzy
}

/** Index of `token` where it starts a word, preferring the earliest word. */
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
    return Math.min(
      MAX_FUZZY_PENALTY,
      positionPenalty(firstMatchIndex) + gapPenalty * 3 + spanPenalty,
    )
  }

  return null
}

// Both penalties are capped so no amount of position or length drift inside one
// tier can carry a candidate past the next tier's offset.
function positionPenalty(index: number) {
  return Math.min(MAX_POSITION_PENALTY, index)
}

function lengthPenalty(field: string, token: string) {
  return Math.min(MAX_LENGTH_PENALTY, Math.max(0, field.length - token.length)) / 2
}
