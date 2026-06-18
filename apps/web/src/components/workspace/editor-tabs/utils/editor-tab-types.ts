import type { StatusPresentation } from '@/features/git/types'
import type { ResolvedFileIcon } from '@/lib/file-icons'

export type EditorTabConflictMap = Readonly<Record<string, { remotePath: string }>>

export type EditorTabModel = {
  active: boolean
  copyPath: string
  copyRelativePath: string
  diffStatus: StatusPresentation | null
  diffSuffix: string
  icon: ResolvedFileIcon
  id: string
  name: string
  path: string
  title: string
}
