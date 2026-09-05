import { useSyncExternalStore } from 'react'

// Only the newest address restore may release the claim that suspends URL writes and recents.
let currentClaim: object | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

export function claimAddressRoot() {
  const claim = {}
  const wasClaimed = currentClaim !== null
  currentClaim = claim
  if (!wasClaimed) notify()
  return () => {
    if (currentClaim !== claim) return
    currentClaim = null
    notify()
  }
}

export function addressRootClaimed() {
  return currentClaim !== null
}

export function subscribeAddressRoot(listener: () => void) {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export function useAddressRootClaimed() {
  return useSyncExternalStore(subscribeAddressRoot, addressRootClaimed, addressRootClaimed)
}
