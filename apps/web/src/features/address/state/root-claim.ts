import { useSyncExternalStore } from 'react'

/**
 * Whether the address applier is still deciding which workspace to open.
 *
 * Two hooks fill the same empty slot at boot. `useAddressRestore` opens the workspace a
 * link names; `useRestoreRecentWorkspaceRoot` opens the newest recent directory when
 * nothing is open. On a machine with no cached root — a fresh install, or a cleared
 * cache — both fire, and the applier has to await slug resolution (and possibly a
 * `fs.recents` round trip) before it can name its root, so the recents fallback
 * routinely calls `activateWorkspaceRoot` second and wins. The pasted link then lands
 * on an arbitrary project, and the loser logs `workspace.root_open_superseded`, which
 * reads as ordinary supersede traffic rather than a lost deep link.
 *
 * The claim is taken synchronously, before the applier's first `await`, from the one
 * fact available that early: the URL names a workspace. It is released the moment the
 * applier stops needing it — resolved, failed or superseded — so a dead link still
 * falls back to recents instead of leaving the app empty.
 *
 * Module-level, like the other address-adjacent stores: this outranks any provider,
 * because it arbitrates between two app-lifetime hooks.
 */
let claimed = false
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

export function claimAddressRoot() {
  if (claimed) return

  claimed = true
  notify()
}

export function releaseAddressRoot() {
  if (!claimed) return

  claimed = false
  notify()
}

function addressRootClaimed() {
  return claimed
}

function subscribe(listener: () => void) {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export function useAddressRootClaimed() {
  return useSyncExternalStore(subscribe, addressRootClaimed, addressRootClaimed)
}
