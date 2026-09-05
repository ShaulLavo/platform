import { pathForDocumentToken } from '@/features/address/utils/document-token'
import { applicableTabs, type Address } from '@/features/address/utils/grammar'
import { NO_WORKSPACE_SLUG, resolveWorkspaceSlug } from '@/features/address/utils/slug'
import { isChatModeToolTab, showChatModeToolTab } from '@/features/chat-mode/utils/panels'
import {
  openEditorPathInWorkbenchPanels,
  setWorkbenchBottomTab,
  setWorkbenchSidebarTab,
  type WorkbenchPanels,
} from '@/features/workbench/utils/panels'
import type { CachedWorkspaceState } from '@/features/workspace/state/cache'

/**
 * The address, folded into the cache before the stores are built.
 *
 * This is what makes the address a peer of the cache rather than an overlay on top of
 * it. `EditorStateProvider` seeds every store from `readWorkspaceCache()` synchronously,
 * so an applier running later in an effect necessarily restores twice — once from the
 * cache, then again from a lossier address that has to overwrite what it does not name.
 * Merging first means one restore, no race, and nothing to undo.
 *
 * Deliberately pure and total: no store, no network, no clock. Anything it cannot decide
 * from `localStorage` alone is left to the post-mount applier, which can await.
 */

/**
 * Tabs UNION rather than replace here, which is the one place this differs from a
 * popstate apply. At boot the address may be a link someone else wrote, and a stranger's
 * two-tab link is not an instruction to close the ten tabs you had open. Back/forward
 * still applies `?tabs=` exactly, because there the set is one this app wrote.
 */
export function addressedWorkspaceCache(
  cached: CachedWorkspaceState,
  address: Address,
): CachedWorkspaceState {
  if (address.environmentId || address.rejectedEnvironment) return cached
  const rootPath = seedableRootPath(cached, address)
  if (rootPath === null) return cached

  const slice = cached.workspaces[rootPath]
  if (!slice) return cached

  return {
    ...cached,
    chatModePanels: address.tool
      ? chatModePanelsWithTool(cached.chatModePanels, address.tool)
      : cached.chatModePanels,
    uiMode: address.mode ?? cached.uiMode,
    workspaces: {
      ...cached.workspaces,
      [rootPath]: {
        ...slice,
        workbenchPanels: panelsForAddress(slice.workbenchPanels, rootPath, address),
      },
    },
  }
}

/**
 * The root this function is allowed to seed: the one already open.
 *
 * A cross-workspace link is deliberately NOT handled here. The cache stores a
 * `PickedFsEntry` for the active root only, so seeding a different one would mean
 * inventing `birthtimeMs`, `mtimeMs` and `size` — and `useValidateRootFolder` only
 * clears an invalid root, it never replaces the entry, so the fabricated stat would
 * outlive the boot it was invented for. Switching projects stays with the post-mount
 * applier, which can await a real `statPath`.
 */
function seedableRootPath(cached: CachedWorkspaceState, address: Address) {
  const openRootPath = cached.rootFolder?.path
  if (openRootPath === undefined) return null
  if (!address.workspace || address.workspace === NO_WORKSPACE_SLUG) return null

  const resolution = resolveWorkspaceSlug(address.workspace, { indexed: cached.workspaceOrder })
  if (resolution.kind !== 'resolved') return null
  if (resolution.rootPath !== openRootPath) return null

  return openRootPath
}

function panelsForAddress(panels: WorkbenchPanels, rootPath: string, address: Address) {
  const withPanes = withBottomTab(withSidebarTab(panels, address), address)
  // Bounded by the same rule the post-mount applier uses. This runs inside
  // `EditorStateProvider`'s `useState` initializer, so an unbounded `?tabs=` blocks
  // first paint on a quadratic open loop — and the result is real store state, which
  // the cache persistence then writes to disk.
  const withTabs = (applicableTabs(address.tabs) ?? []).reduce(
    (next, token) => withDocumentToken(next, rootPath, token),
    withPanes,
  )

  // In chat mode the document slot holds a `t/` session token, which is not a workspace
  // document — feeding it to the file codec would open a bogus tab.
  if (address.mode === 'chat' || !address.document) return withTabs

  return withDocumentToken(withTabs, rootPath, address.document)
}

function withDocumentToken(panels: WorkbenchPanels, rootPath: string, token: string) {
  const parsed = pathForDocumentToken(rootPath, token)
  if (parsed.kind !== 'path') return panels

  return openEditorPathInWorkbenchPanels(panels, parsed.path)
}

function withSidebarTab(panels: WorkbenchPanels, address: Address) {
  return address.side ? setWorkbenchSidebarTab(panels, address.side) : panels
}

function withBottomTab(panels: WorkbenchPanels, address: Address) {
  return address.bottom ? setWorkbenchBottomTab(panels, address.bottom) : panels
}

function chatModePanelsWithTool(panels: CachedWorkspaceState['chatModePanels'], tool: string) {
  if (!isChatModeToolTab(tool)) return panels
  if (panels.activeToolTab === tool) return panels

  return showChatModeToolTab(panels, tool)
}
