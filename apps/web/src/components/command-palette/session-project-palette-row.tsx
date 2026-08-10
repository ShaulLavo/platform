import { PlusIcon } from '@phosphor-icons/react'
import { CommandItem, CommandShortcut } from '@workspace/ui/components/command'

import { useCommandPaletteActions } from '@/components/command-palette/hooks/use-command-palette-actions'
import { sessionProjectItemValue } from '@/components/command-palette/command-palette-utils'
import type { SessionRailProject } from '@/features/chat-mode/utils/session-rail-model'

export function SessionProjectPaletteRow({ project }: { readonly project: SessionRailProject }) {
  const { startSessionDraft } = useCommandPaletteActions()

  return (
    <CommandItem
      keywords={[project.title, project.workspaceRoot, project.qualifier ?? '']}
      value={sessionProjectItemValue(project.id)}
      onSelect={() => startSessionDraft(project.id)}
    >
      <PlusIcon className='text-muted-foreground' weight='bold' />
      <span className='max-w-[55%] shrink-0 truncate font-medium'>{project.title}</span>
      <span className='text-muted-foreground min-w-0 flex-1 truncate text-[11px]'>
        {project.workspaceRoot}
      </span>
      <CommandShortcut className='tabular-nums'>{project.sessionCount}</CommandShortcut>
    </CommandItem>
  )
}
