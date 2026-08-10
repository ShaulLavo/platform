/**
 * Fractional index keys for the user-arranged pinned block.
 *
 * A pinned thread carries an optional `pinOrderKey` — a base-26 string. The
 * pinned block sorts keyed threads by plain string comparison, so a drag writes
 * ONE key to ONE thread: the neighbours are never rewritten, and two clients
 * that saw the same drop converge on the same order without a shared counter.
 */
export const PIN_ORDER_DIGITS = 'abcdefghijklmnopqrstuvwxyz'

const PIN_ORDER_MIN_DIGIT = PIN_ORDER_DIGITS.charAt(0)

export function isValidPinOrderKey(key: string) {
  if (key.length === 0) return false
  for (const char of key) {
    if (!PIN_ORDER_DIGITS.includes(char)) return false
  }

  // A trailing minimum digit would leave no room to sort a key immediately
  // before this one; generators never produce it, so treat it as corrupt.
  return key.at(-1) !== PIN_ORDER_MIN_DIGIT
}

/**
 * Midpoint of two digit strings read as fractions in (0, 1). `''` stands for
 * the open bound on either side. Only reachable through `pinOrderKeyBetween`,
 * which is what establishes `a < b` — the recursion preserves it.
 */
function pinOrderMidpoint(a: string, b: string): string {
  if (b !== '') {
    // Recurse past the longest common prefix (the minimum digit pads the
    // shorter side).
    let n = 0
    while ((a.charAt(n) || PIN_ORDER_MIN_DIGIT) === b.charAt(n)) n += 1
    if (n > 0) return b.slice(0, n) + pinOrderMidpoint(a.slice(n), b.slice(n))
  }

  const digitA = a === '' ? 0 : PIN_ORDER_DIGITS.indexOf(a.charAt(0))
  const digitB = b === '' ? PIN_ORDER_DIGITS.length : PIN_ORDER_DIGITS.indexOf(b.charAt(0))
  if (digitB - digitA > 1) return PIN_ORDER_DIGITS.charAt(Math.round((digitA + digitB) / 2))
  // Consecutive leading digits: either b has spare digits to shorten into, or
  // we extend a — never producing a trailing minimum digit, because the base
  // case midpoint('', '') is the middle of the alphabet.
  if (b.length > 1) return b.charAt(0)

  return PIN_ORDER_DIGITS.charAt(digitA) + pinOrderMidpoint(a.slice(1), '')
}

/**
 * Key that sorts strictly between two neighbours; `null` bounds mean "top of
 * the pinned block" / "bottom of the keyed run". Returns `null` rather than
 * throwing when the existing keys are corrupt or out of order — the caller
 * falls back to rewriting the whole section.
 */
export function pinOrderKeyBetween(before: string | null, after: string | null): string | null {
  const a = before ?? ''
  const b = after ?? ''
  if (a !== '' && !isValidPinOrderKey(a)) return null
  if (b !== '' && !isValidPinOrderKey(b)) return null
  if (b !== '' && a >= b) return null

  return pinOrderMidpoint(a, b)
}

/**
 * Evenly spaced keys for rewriting a whole pinned section, used when a drop
 * lands next to a keyless thread so single-key insertion has nothing to anchor
 * on. Two base-26 digits give 675 slots — far beyond any real pinned section —
 * with monotonicity enforced as belt and braces.
 */
export function generateSpreadPinOrderKeys(count: number): string[] {
  const space = PIN_ORDER_DIGITS.length * PIN_ORDER_DIGITS.length
  const step = space / (count + 1)
  const keys: string[] = []
  let previous = 0

  for (let index = 0; index < count; index += 1) {
    let value = Math.max(Math.round(step * (index + 1)), previous + 1)
    // Skip values whose low digit is the minimum (a trailing 'a' key).
    if (value % PIN_ORDER_DIGITS.length === 0) value += 1
    value = Math.min(value, space - 1)
    previous = value
    keys.push(
      PIN_ORDER_DIGITS.charAt(Math.floor(value / PIN_ORDER_DIGITS.length)) +
        PIN_ORDER_DIGITS.charAt(value % PIN_ORDER_DIGITS.length),
    )
  }

  return keys
}

export type PinOrderAssignment = {
  readonly id: string
  readonly orderKey: string
}

/**
 * The writes needed to realize a new pinned order. When the moved thread lands
 * between two keyed (or absent) neighbours this is a single write to the moved
 * thread. When a neighbour is keyless — a thread pinned before reordering
 * existed — the whole section gets fresh spread keys, a one-time
 * materialization; every move after that is single-write again.
 */
export function planPinnedReorder(input: {
  /** Thread ids in the desired visual order, after the move. */
  readonly orderedIds: readonly string[]
  readonly keysById: ReadonlyMap<string, string | null | undefined>
  readonly movedId: string
}): readonly PinOrderAssignment[] {
  const { keysById, movedId, orderedIds } = input
  const movedIndex = orderedIds.indexOf(movedId)
  if (movedIndex === -1) return []

  const single = singlePinOrderWrite(orderedIds, keysById, movedId, movedIndex)
  if (single) return single

  const keys = generateSpreadPinOrderKeys(orderedIds.length)

  return orderedIds.flatMap((id, index) => {
    const orderKey = keys[index]
    if (orderKey === undefined) return []
    if (keysById.get(id) === orderKey) return []

    return [{ id, orderKey }]
  })
}

function singlePinOrderWrite(
  orderedIds: readonly string[],
  keysById: ReadonlyMap<string, string | null | undefined>,
  movedId: string,
  movedIndex: number,
): readonly PinOrderAssignment[] | null {
  const beforeId = movedIndex > 0 ? orderedIds[movedIndex - 1] : null
  const afterId = movedIndex < orderedIds.length - 1 ? orderedIds[movedIndex + 1] : null
  const beforeKey = beforeId == null ? null : (keysById.get(beforeId) ?? null)
  const afterKey = afterId == null ? null : (keysById.get(afterId) ?? null)
  // A keyless neighbour cannot anchor an insertion: the caller has to respread.
  if (beforeId != null && beforeKey === null) return null
  if (afterId != null && afterKey === null) return null

  const orderKey = pinOrderKeyBetween(beforeKey, afterKey)
  if (orderKey === null) return null

  return [{ id: movedId, orderKey }]
}

/**
 * Pinned block order: user-arranged keys first (plain string comparison, id
 * tiebreak), then keyless threads newest-created first — so threads pinned
 * before reordering existed keep a stable creation order at the bottom of the
 * block instead of breaking the section.
 */
export function sortPinnedThreadsByOrderKey<
  Thread extends {
    readonly id: string
    readonly createdAt: string
    readonly pinOrderKey?: string | null | undefined
  },
>(threads: readonly Thread[]): Thread[] {
  const keyed: Thread[] = []
  const keyless: Thread[] = []
  for (const thread of threads) {
    if (thread.pinOrderKey == null) {
      keyless.push(thread)
      continue
    }
    keyed.push(thread)
  }

  keyed.sort(comparePinOrderKeys)
  keyless.sort(compareNewestCreatedFirst)

  return [...keyed, ...keyless]
}

function comparePinOrderKeys(
  left: { readonly id: string; readonly pinOrderKey?: string | null },
  right: { readonly id: string; readonly pinOrderKey?: string | null },
) {
  const leftKey = left.pinOrderKey ?? ''
  const rightKey = right.pinOrderKey ?? ''
  if (leftKey < rightKey) return -1
  if (leftKey > rightKey) return 1

  return left.id.localeCompare(right.id)
}

function compareNewestCreatedFirst(
  left: { readonly id: string; readonly createdAt: string },
  right: { readonly id: string; readonly createdAt: string },
) {
  const leftMs = Date.parse(left.createdAt)
  const rightMs = Date.parse(right.createdAt)
  const order = (Number.isNaN(rightMs) ? 0 : rightMs) - (Number.isNaN(leftMs) ? 0 : leftMs)
  if (order !== 0) return order

  return left.id.localeCompare(right.id)
}
