import type { StatusPresentation } from '@/features/git/utils/types'
import type { ResolvedFileIcon } from '@/lib/file-icons'

export type EditorTabConflictMap = Readonly<Record<string, { remotePath: string }>>

/** The working-tree file a diff tab is comparing, when it compares exactly one. */
export type EditorTabDiffSource = {
  /** A deleted file has nothing left on disk to open. */
  onDisk: boolean
  path: string
}

export type EditorTabModel = {
  active: boolean
  copyPath: string
  copyRelativePath: string
  diffSource: EditorTabDiffSource | null
  diffStatus: StatusPresentation | null
  diffSuffix: string
  icon: ResolvedFileIcon
  id: string
  name: string
  path: string
  title: string
}
