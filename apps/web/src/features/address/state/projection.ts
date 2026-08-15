import { formatAddress, type Address } from '@/features/address/utils/grammar'
import { log } from '@/lib/client-logging'

/**
 * Store → URL. Nothing reads the URL here; this is a projection, and it writes with
 * `replace` only, so it can never add a history entry the user did not ask for.
 *
 * Two things it must survive. Writes arrive far faster than they matter — holding
 * next-session repeats at key-repeat speed — so they coalesce to one per frame. And
 * Safari throttles `replaceState` at roughly 100 calls per 30 seconds and then
 * *throws*, so the writer carries its own budget and degrades loudly rather than
 * taking the app down.
 */

const RATE_WINDOW_MS = 30_000
const RATE_LIMIT = 90

export type AddressWriter = {
  readonly push: (href: string) => void
  readonly replace: (href: string) => void
}

/**
 * §1.1 decides history mode by slot, keyed so that two ways of reaching the same place
 * cannot disagree. Identity — which workspace, which mode, which document, and whether
 * the settings overlay is up — PUSHES, so back returns you to where you were. Panels,
 * filters and the focus line REPLACE: nobody wants six history entries because they
 * typed six characters into search.
 */
function identityOf(address: Address) {
  return JSON.stringify([address.workspace, address.mode, address.document, address.settings])
}

export type AddressProjectionOptions = {
  /** Injected so node tests drive the projection without a DOM or a real clock. */
  readonly now: () => number
  readonly schedule: (write: () => void) => void
  readonly writer: AddressWriter
}

export type AddressProjection = {
  /** Drops a scheduled write. StrictMode builds two projections; only one may win. */
  readonly cancel: () => void
  readonly project: (address: Address) => void
  /** A user-initiated navigation clears a tripped budget; the app is interactive again. */
  readonly resume: () => void
}

export function createAddressProjection({
  now,
  schedule,
  writer,
}: AddressProjectionOptions): AddressProjection {
  let pending: Address | null = null
  let scheduled = false
  let lastWritten: string | null = null
  let lastIdentity: string | null = null
  let cancelled = false
  let throttled = false
  let windowStart = now()
  let writesInWindow = 0

  function flush() {
    scheduled = false
    const address = pending
    pending = null
    if (!address || cancelled) return

    const href = formatAddress(address)
    // The store settles far more often than the address changes; an identical href is
    // not worth a write, and not worth a slot in the rate budget either.
    if (href === lastWritten) return

    const identity = identityOf(address)
    const isNavigation = lastIdentity !== null && identity !== lastIdentity
    // A real navigation is user-initiated by definition, so it also clears a tripped
    // budget: the alternative is an address that stays silently dead for the session.
    if (isNavigation) resumeBudget()
    if (!claimRateBudget()) return

    lastWritten = href
    lastIdentity = identity
    if (isNavigation) writer.push(href)
    else writer.replace(href)
    log.debug({
      action: 'address.projected',
      area: 'address',
      href,
      writesInWindow,
    })
  }

  function claimRateBudget() {
    const at = now()
    // The window refilling is also what un-latches the throttle: recovery must not
    // depend on anything the user does, or a burst leaves the address stale forever.
    if (at - windowStart > RATE_WINDOW_MS) {
      windowStart = at
      writesInWindow = 0
      throttled = false
    }
    if (throttled) return false

    writesInWindow += 1
    if (writesInWindow <= RATE_LIMIT) return true

    throttled = true
    log.warn({
      action: 'address.projection_throttled',
      area: 'address',
      windowMs: RATE_WINDOW_MS,
      writes: writesInWindow,
    })
    return false
  }

  /**
   * Clears the latch, NOT the counter. A navigation earns another attempt, but the
   * rolling window stays the hard cap — otherwise holding next-session at key-repeat
   * speed would reset the budget on every keypress and defeat the Safari limit the
   * budget exists for. The window refills on its own after RATE_WINDOW_MS.
   */
  function resumeBudget() {
    throttled = false
  }

  return {
    cancel() {
      cancelled = true
      pending = null
    },
    // Always schedules, even while throttled: `flush` owns the budget decision, and a
    // projection that refused to schedule could never notice the window refill.
    project(address) {
      pending = address
      if (scheduled) return

      scheduled = true
      schedule(flush)
    },
    resume: resumeBudget,
  }
}
