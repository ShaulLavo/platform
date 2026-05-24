import { colorForFileIcon, iconForEntry, type ResolvedFileIcon } from '@/lib/file-icons'
import { basename, toTreePath } from '@/lib/path-formatters'
import { cn } from '@workspace/ui/lib/utils'
import type { CSSProperties, KeyboardEvent } from 'react'

import { useOpenDiffDocument } from '../hooks'
import { gitStatusSymbol } from '../status-symbols'
import type { ChangeRow } from '../types'
import { parentPath } from '../utils'
import { FileActions } from './file-actions'

export function FileRow({ rootPath, row }: { rootPath: string; row: ChangeRow }) {
  const { openDiff } = useOpenDiffDocument()
  const relativePath = toTreePath(row.file.path, rootPath)
  const name = basename(relativePath)
  const directory = parentPath(relativePath)
  const icon = iconForEntry({ name, type: 'file' })
  const status = gitStatusSymbol(row.status, row.section)

  function handleOpen() {
    void openDiff(row)
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return

    event.preventDefault()
    handleOpen()
  }

  return (
    <div
      className='group/row hover:bg-muted/70 focus-visible:ring-ring/50 grid h-6 cursor-pointer grid-cols-[22px_minmax(0,1fr)_auto_28px] items-center px-2 text-xs leading-4 outline-none focus-visible:ring-1'
      role='button'
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleRowKeyDown}
    >
      <span
        aria-hidden='true'
        className='size-4 shrink-0 justify-self-center'
        style={fileIconStyle(icon)}
      />
      <div className='min-w-0 truncate text-left' title={relativePath}>
        <span className='text-foreground font-medium'>{name}</span>
        {directory && <span className='text-muted-foreground ml-2 font-normal'>{directory}</span>}
      </div>
      <FileActions path={row.file.path} section={row.section} />
      <span
        className={cn(
          'flex h-6 items-center justify-self-end pb-px text-xs font-semibold leading-none',
          status.className,
        )}
        title={status.title}
      >
        {status.label}
      </span>
    </div>
  )
}

function fileIconStyle(icon: ResolvedFileIcon): CSSProperties {
  const mask = `url(${icon.src}) center / contain no-repeat`

  return {
    backgroundColor: colorForFileIcon(icon),
    mask,
    WebkitMask: mask,
  }
}
