import type { EditorTabModel } from '@/components/workspace/editor-tab-types'
import { reportClientError } from '@/lib/client-error-reporting'
import { toast } from 'sonner'

export function editorTabCloseTargets(
  tabs: readonly EditorTabModel[],
  dirtyFilePaths: ReadonlySet<string>,
) {
  return tabs.map((tab) => ({
    dirty: dirtyFilePaths.has(tab.path),
    id: tab.id,
    path: tab.path,
  }))
}

export async function copyTextToClipboard(text: string, label: string) {
  if (!navigator.clipboard?.writeText) {
    toast.error('Clipboard is unavailable')
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    toast.success(`Copied ${label}`)
  } catch (error) {
    reportClientError({
      area: 'editor-tabs',
      cause: error,
      context: { label },
      message: `Could not copy ${label}`,
      operation: 'copy-path',
    })
    toast.error(`Could not copy ${label}`)
  }
}
