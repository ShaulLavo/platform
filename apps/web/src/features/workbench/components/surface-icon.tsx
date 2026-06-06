import {
  ChatCircleTextIcon,
  FileCodeIcon,
  FileDashedIcon,
  FileMagnifyingGlassIcon,
  FilesIcon,
  FolderIcon,
  GitBranchIcon,
  ListBulletsIcon,
  PulseIcon,
  TerminalWindowIcon,
} from '@phosphor-icons/react'

import type { SurfaceType } from '@/features/tiling-surface-manager/utils/layout-types'

export function SurfaceIcon({
  className,
  type,
}: {
  readonly className?: string
  readonly type: SurfaceType
}) {
  if (type === 'chat') return <ChatCircleTextIcon className={className} />
  if (type === 'file-editor') return <FileCodeIcon className={className} />
  if (type === 'diff') return <FilesIcon className={className} />
  if (type === 'search-results') return <FileMagnifyingGlassIcon className={className} />
  if (type === 'search-preview') return <FileMagnifyingGlassIcon className={className} />
  if (type === 'terminal') return <TerminalWindowIcon className={className} />
  if (type === 'file-navigator') return <FolderIcon className={className} />
  if (type === 'git-changes') return <GitBranchIcon className={className} />
  if (type === 'logs') return <ListBulletsIcon className={className} />
  if (type === 'diagnostics') return <PulseIcon className={className} />

  return <FileDashedIcon className={className} />
}
