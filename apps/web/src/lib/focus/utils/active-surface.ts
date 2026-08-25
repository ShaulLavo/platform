import type { FocusTargetSnapshot } from '@/lib/focus/state/service'

export type ActiveSurfaceFocusIdentity = {
  readonly diffPath: string | null
  readonly layout: 'chat' | 'workbench'
  readonly searchRoot: string | null
  readonly tabId: string
}

export function matchesActiveSurface(
  target: FocusTargetSnapshot,
  identity: ActiveSurfaceFocusIdentity,
) {
  if (target.layout !== identity.layout) return false
  if (target.id.kind === 'settings-page') return target.id.tabId === identity.tabId
  if (target.id.kind === 'search') {
    return target.id.surface === 'editor' && target.id.rootPath === identity.searchRoot
  }
  if (target.id.kind !== 'editor') return false
  if (target.id.side === 'old') return false
  if (target.id.tabId === identity.tabId) return true
  if (target.id.tabId !== undefined) return false

  return (
    target.id.surface === 'diff' &&
    identity.diffPath !== null &&
    target.id.key === identity.diffPath
  )
}
