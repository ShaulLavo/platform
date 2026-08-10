/**
 * Fractional index keys for a user-arranged list.
 *
 * A row carries an optional order key — a base-26 string. The list sorts keyed
 * rows by plain string comparison, so a drag writes ONE key to ONE row: the
 * neighbours are never rewritten, and two clients that saw the same drop
 * converge on the same order without a shared counter.
 *
 * One algorithm serves every arranged list: the pinned thread block (which
 * persists its key as `pinOrderKey`) and the project list (`orderKey`).
 */
export const ORDER_KEY_DIGITS = 'abcdefghijklmnopqrstuvwxyz'

const ORDER_KEY_MIN_DIGIT = ORDER_KEY_DIGITS.charAt(0)

export function isValidOrderKey(key: string) {
  if (key.length === 0) return false
  for (const char of key) {
    if (!ORDER_KEY_DIGITS.includes(char)) return false
  }

  // A trailing minimum digit would leave no room to sort a key immediately
  // before this one; generators never produce it, so treat it as corrupt.
  return key.at(-1) !== ORDER_KEY_MIN_DIGIT
}

/**
 * Midpoint of two digit strings read as fractions in (0, 1). `''` stands for
 * the open bound on either side. Only reachable through `orderKeyBetween`,
 * which is what establishes `a < b` — the recursion preserves it.
 */
function orderKeyMidpoint(a: string, b: string): string {
  if (b !== '') {
    // Recurse past the longest common prefix (the minimum digit pads the
    // shorter side).
    let n = 0
    while ((a.charAt(n) || ORDER_KEY_MIN_DIGIT) === b.charAt(n)) n += 1
    if (n > 0) return b.slice(0, n) + orderKeyMidpoint(a.slice(n), b.slice(n))
  }

  const digitA = a === '' ? 0 : ORDER_KEY_DIGITS.indexOf(a.charAt(0))
  const digitB = b === '' ? ORDER_KEY_DIGITS.length : ORDER_KEY_DIGITS.indexOf(b.charAt(0))
  if (digitB - digitA > 1) return ORDER_KEY_DIGITS.charAt(Math.round((digitA + digitB) / 2))
  // Consecutive leading digits: either b has spare digits to shorten into, or
  // we extend a — never producing a trailing minimum digit, because the base
  // case midpoint('', '') is the middle of the alphabet.
  if (b.length > 1) return b.charAt(0)

  return ORDER_KEY_DIGITS.charAt(digitA) + orderKeyMidpoint(a.slice(1), '')
}

/**
 * Key that sorts strictly between two neighbours; `null` bounds mean "top of
 * the list" / "bottom of the keyed run". Returns `null` rather than throwing
 * when the existing keys are corrupt or out of order — the caller falls back to
 * rewriting the whole section.
 */
export function orderKeyBetween(before: string | null, after: string | null): string | null {
  const a = before ?? ''
  const b = after ?? ''
  if (a !== '' && !isValidOrderKey(a)) return null
  if (b !== '' && !isValidOrderKey(b)) return null
  if (b !== '' && a >= b) return null

  return orderKeyMidpoint(a, b)
}

/**
 * Evenly spaced keys for rewriting a whole section, used when a drop lands next
 * to a keyless row so single-key insertion has nothing to anchor on. Two
 * base-26 digits give 675 slots — far beyond any real arranged section — with
 * monotonicity enforced as belt and braces.
 */
export function generateSpreadOrderKeys(count: number): string[] {
  const space = ORDER_KEY_DIGITS.length * ORDER_KEY_DIGITS.length
  const step = space / (count + 1)
  const keys: string[] = []
  let previous = 0

  for (let index = 0; index < count; index += 1) {
    let value = Math.max(Math.round(step * (index + 1)), previous + 1)
    // Skip values whose low digit is the minimum (a trailing 'a' key).
    if (value % ORDER_KEY_DIGITS.length === 0) value += 1
    value = Math.min(value, space - 1)
    previous = value
    keys.push(
      ORDER_KEY_DIGITS.charAt(Math.floor(value / ORDER_KEY_DIGITS.length)) +
        ORDER_KEY_DIGITS.charAt(value % ORDER_KEY_DIGITS.length),
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

  const single = singleOrderKeyWrite(orderedIds, keysById, movedId, movedIndex)
  if (single) return single

  const keys = generateSpreadOrderKeys(orderedIds.length)

  return orderedIds.flatMap((id, index) => {
    const orderKey = keys[index]
    if (orderKey === undefined) return []
    if (keysById.get(id) === orderKey) return []

    return [{ id, orderKey }]
  })
}

function singleOrderKeyWrite(
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

  const orderKey = orderKeyBetween(beforeKey, afterKey)
  if (orderKey === null) return null

  return [{ id: movedId, orderKey }]
}

/**
 * A row of an arranged list. Threads persist their key as `pinOrderKey` and
 * projects as `orderKey`; the sort reads whichever the row carries so both
 * lists run on this one comparison instead of two that can drift.
 */
type OrderKeyedRow = {
  readonly id: string
  readonly createdAt: string
  readonly orderKey?: string | null | undefined
  readonly pinOrderKey?: string | null | undefined
}

/**
 * Arranged order: user-placed keys first (plain string comparison, id
 * tiebreak), then keyless rows newest-created first — so rows that existed
 * before reordering did keep a stable creation order at the bottom of the list
 * instead of breaking the section.
 */
export function sortByOrderKey<Row extends OrderKeyedRow>(rows: readonly Row[]): Row[] {
  const keyed: Row[] = []
  const keyless: Row[] = []
  for (const row of rows) {
    if (readOrderKey(row) == null) {
      keyless.push(row)
      continue
    }
    keyed.push(row)
  }

  keyed.sort(compareOrderKeys)
  keyless.sort(compareNewestCreatedFirst)

  return [...keyed, ...keyless]
}

function readOrderKey(row: OrderKeyedRow) {
  return row.orderKey ?? row.pinOrderKey ?? null
}

function compareOrderKeys(left: OrderKeyedRow, right: OrderKeyedRow) {
  const leftKey = readOrderKey(left) ?? ''
  const rightKey = readOrderKey(right) ?? ''
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
