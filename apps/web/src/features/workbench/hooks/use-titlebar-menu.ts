import { useQuery } from '@tanstack/react-query'

import { useTheme } from '@/components/theme-context'
import { selectChatProjects } from '@/features/chat/state/chat-projection-selectors'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { useMenuCommand } from '@/features/menus/providers/command-context'
import { projectMenuModel } from '@/features/workbench/utils/project-menu-model'
import { titlebarMenu } from '@/features/workbench/utils/titlebar-menu'
import { useOpenWorkspaceRoot } from '@/hooks/use-open-workspace-root'
import { copyTextToClipboard } from '@/lib/clipboard'
import { recentFoldersQueryOptions } from '@/lib/recent-folders-query'

const EMPTY_FOLDERS: readonly { name: string; path: string }[] = []

/**
 * `open` gates the recents fetch: they are a menu concern, not app state, and
 * the title bar renders for the whole life of the app.
 */
export function useTitlebarMenu(open: boolean) {
  const rootFolder = useEditorWorkspaceState((state) => state.rootFolder)
  const uiMode = useEditorWorkspaceState((state) => state.uiMode)
  const projects = useChatProjectionStore(selectChatProjects)
  const runCommand = useMenuCommand((state) => state.runCommand)
  const openWorkspaceRoot = useOpenWorkspaceRoot()
  const { theme } = useTheme()
  const recentFolders = useQuery(recentFoldersQueryOptions({ enabled: open }))
  const workspacePath = rootFolder?.path ?? null

  function selectProject(rootPath: string) {
    if (rootPath === workspacePath) return

    void openWorkspaceRoot(rootPath)
  }

  return titlebarMenu({
    colorMode: theme,
    copyWorkspacePath: () => void copyTextToClipboard(workspacePath ?? '', 'workspace path'),
    projects: projectMenuModel({
      activeRootPath: workspacePath,
      activeTitle: rootFolder?.name ?? '',
      projects,
      recentFolders: recentFolders.data ?? EMPTY_FOLDERS,
    }),
    runCommand,
    selectProject,
    uiMode,
    workspacePath,
  })
}
