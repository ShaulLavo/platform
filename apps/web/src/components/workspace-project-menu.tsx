import { CaretDownIcon, FolderOpenIcon, FolderPlusIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { selectChatProjects } from '@/features/chat/state/chat-projection-selectors'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { useEditorWorkspaceState } from '@/features/editor/state/workspace-state'
import { projectMenuModel } from '@/features/workbench/utils/project-menu-model'
import { useOpenWorkspaceRoot } from '@/hooks/use-open-workspace-root'
import { NATIVE_WINDOW_NO_DRAG_CLASS } from '@/lib/platform/window-drag'
import { recentFoldersQueryOptions } from '@/lib/recent-folders-query'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
import { cn } from '@workspace/ui/lib/utils'

const EMPTY_FOLDERS: readonly { name: string; path: string }[] = []

export function WorkspaceProjectMenu({ workspaceTitle }: { readonly workspaceTitle: string }) {
  const [open, setOpen] = useState(false)
  const rootPath = useEditorWorkspaceState((state) => state.rootFolder?.path ?? null)
  const openPicker = useEditorWorkspaceState((state) => state.openPicker)
  const projects = useChatProjectionStore(selectChatProjects)
  const openWorkspaceRoot = useOpenWorkspaceRoot()
  // Only fetched while the menu is open: recents are a menu concern, not app state.
  const recentFolders = useQuery(recentFoldersQueryOptions({ enabled: open }))
  const entries = projectMenuModel({
    activeRootPath: rootPath,
    activeTitle: workspaceTitle,
    projects,
    recentFolders: recentFolders.data ?? EMPTY_FOLDERS,
  })

  function handleSelect(nextRootPath: string) {
    if (nextRootPath === rootPath) return

    void openWorkspaceRoot(nextRootPath)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <button
            aria-label='Switch project'
            className={cn(
              NATIVE_WINDOW_NO_DRAG_CLASS,
              'hover:bg-accent focus-visible:ring-ring/50 flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left outline-none focus-visible:ring-1',
            )}
            type='button'
          />
        }
      >
        <FolderOpenIcon className='text-muted-foreground size-4 shrink-0' weight='duotone' />
        <span className='truncate text-xs font-medium'>{workspaceTitle}</span>
        <CaretDownIcon className='text-muted-foreground size-3 shrink-0' />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='start'
        className='max-h-[60vh] w-64 overflow-y-auto rounded-md p-1'
      >
        <DropdownMenuRadioGroup value={rootPath ?? ''}>
          {/* Inside the group: base-ui resolves the label against its group context. */}
          <DropdownMenuLabel>Recent</DropdownMenuLabel>
          {entries.map((entry) => (
            <DropdownMenuRadioItem
              key={entry.rootPath}
              value={entry.rootPath}
              onClick={() => handleSelect(entry.rootPath)}
            >
              <span className='flex min-w-0 flex-1 items-baseline gap-1.5'>
                <span className='truncate'>{entry.title}</span>
                {entry.qualifier ? (
                  <span className='text-muted-foreground/70 shrink-0 truncate text-[11px]'>
                    {entry.qualifier}
                  </span>
                ) : null}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={openPicker}>
          <FolderPlusIcon className='size-4' />
          Open folder…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
