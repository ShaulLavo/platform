import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { useMenuCommand } from '@/features/menus/providers/command-context'
import { resolveMenu, type ResolvedMenu } from '@/features/menus/utils/resolve'
import type { Menu } from '@/features/menus/utils/model'

/**
 * Binds a menu definition to the live command table. Availability is read from
 * the same source the command palette uses, so an item cannot be enabled in
 * one surface and disabled in the other.
 */
export function useResolvedMenu(menu: Menu): ResolvedMenu {
  const bindings = useMenuCommand((state) => state.bindings)
  const runCommand = useMenuCommand((state) => state.runCommand)
  const activeFilePath = useEditorWorkspaceState((state) => state.selectedFilePath)
  const hasWorkspace = useEditorWorkspaceState((state) => Boolean(state.rootFolder))

  return resolveMenu(menu, {
    bindings,
    disabled: { activeFilePath, hasWorkspace },
    dispatch: runCommand,
  })
}
