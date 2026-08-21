import { createTextDiff } from '@singapor/diff'
import { useMemo } from 'react'

import { DiffEditor } from '@/features/editor/components/diff-editor'
import { useDiffOwnedText } from '@/features/editor/hooks/use-diff-owned-text'
import { useEditorDocumentState } from '@/features/editor/state/document-state'
import { useSelectedFile } from '@/features/workspace/hooks/use-selected-file'
import { languageIdForFilePath } from '@/features/editor/utils/file-path'
import { useSettingValue } from '@/features/settings/hooks/use-setting-value'

/**
 * Diffs the active buffer against the file on disk — VS Code's "Compare Active File with Saved".
 *
 * Both sides are read live rather than snapshotted when the tab opened: the saved side comes from
 * the file cache and the working side from the live buffer, so the diff keeps answering "what have
 * I changed" as you keep typing.
 */
export function CompareSavedView({ path, rootPath }: { path: string; rootPath: string }) {
  const mode = useSettingValue('editor.diff.viewMode')
  const { fileState } = useSelectedFile(path)
  const buffer = useEditorDocumentState((state) => state.liveDocumentsById[path]?.buffer ?? null)
  // Revision, not the buffer object: the buffer is mutated in place, so its identity never changes
  // and would never re-run the diff.
  const revision = useEditorDocumentState((state) => state.documentContentRevisions[path] ?? '')
  // Its new side IS the live buffer, so it is by construction the text the owning editor sent the
  // server. No special case — the ordinary comparison simply holds.
  const languageServer = useDiffOwnedText(path, rootPath)

  const savedText = fileState.status === 'ready' ? fileState.data.content : null
  const file = useMemo(() => {
    if (savedText === null || !buffer) return null

    const languageId = languageIdForFilePath(path)
    return createTextDiff({
      newFile: { languageId, path, text: buffer.materializeFullText() },
      oldFile: { languageId, path, text: savedText },
    })
    // `revision` stands in for the buffer's contents; see the selector above.
  }, [buffer, path, revision, savedText])

  if (fileState.status === 'error') {
    return <CompareNotice message='Could not read the saved file.' tone='error' />
  }
  if (!file) {
    return (
      <CompareNotice
        message={buffer ? 'Loading saved contents…' : 'Open the file to compare it with disk.'}
      />
    )
  }
  if (file.hunks.length === 0) return <CompareNotice message='No unsaved changes.' />

  return <DiffEditor file={file} languageServer={languageServer} mode={mode} />
}

function CompareNotice({ message, tone }: { message: string; tone?: 'error' }) {
  return (
    <div
      className={
        tone === 'error'
          ? 'text-destructive flex h-full items-center justify-center p-4 text-sm'
          : 'text-muted-foreground flex h-full items-center justify-center p-4 text-sm'
      }
    >
      {message}
    </div>
  )
}
