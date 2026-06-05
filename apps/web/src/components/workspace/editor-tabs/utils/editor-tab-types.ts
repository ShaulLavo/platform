import type { ChromeVisualTab } from '@/components/workspace/editor-tabs/hooks/use-chrome-visual-tabs'
import type { StatusPresentation } from '@/features/git/types'
import type { ResolvedFileIcon } from '@/lib/file-icons'

export type EditorTabSizing = 'chrome' | 'fit' | 'fixed' | 'shrink'

export const DEFAULT_EDITOR_TAB_SIZING: EditorTabSizing = 'chrome'

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

export type EditorChromeVisualTab = ChromeVisualTab<EditorTabModel>
