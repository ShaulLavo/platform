import { CaretDownIcon } from '@phosphor-icons/react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@workspace/ui/components/collapsible'
import { cn } from '@workspace/ui/lib/utils'

import { useGitState } from '../state'
import type { ChangeRow, PanelSection } from '../types'
import { FileRow } from './file-row'
import { GroupActions } from './group-actions'

export function ChangeGroup({
  label,
  rootPath,
  rows,
  section,
}: {
  label: string
  rootPath: string
  rows: readonly ChangeRow[]
  section: PanelSection
}) {
  const open = useGitState((state) => state.sectionOpen[section])
  const setSectionOpen = useGitState((state) => state.setSectionOpen)
  if (rows.length === 0) return null

  return (
    <Collapsible
      className='pb-1'
      open={open}
      onOpenChange={(nextOpen) => setSectionOpen(section, nextOpen)}
    >
      <div className='group/group hover:bg-muted/70 flex h-7 w-full items-center px-2 text-xs font-medium transition-colors'>
        <CollapsibleTrigger className='focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:ring-1'>
          <CaretDownIcon
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              !open && '-rotate-90',
            )}
          />
          <span className='min-w-0 flex-1 truncate'>{label}</span>
        </CollapsibleTrigger>
        <GroupActions rows={rows} section={section} />
        <span className='bg-background text-muted-foreground ml-1 flex h-5 min-w-5 items-center justify-center rounded-full border px-1.5 text-[11px] font-normal'>
          {rows.length}
        </span>
      </div>
      <CollapsibleContent className='ml-5 border-l'>
        {rows.map((row) => (
          <FileRow
            key={`${row.section}:${row.file.path}:${row.status}`}
            rootPath={rootPath}
            row={row}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}
