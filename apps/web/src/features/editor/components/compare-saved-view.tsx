import { DiffView as EditorDiffView, createTextDiff } from '@singapor/diff'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useEditorColorTheme } from '@/features/editor/hooks/use-editor-color-theme'
import { editorTreeSitterSyntaxProvider } from '@/features/editor/editor-plugins'
import { useEditorDocumentState } from '@/features/editor/state/editor-document-state'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { useSelectedFile } from '@/hooks/use-selected-file'
import { languageIdForFilePath } from '@/features/editor/utils/file-path'

/**
 * Diffs the active buffer against the file on disk — VS Code's "Compare Active File with Saved".
 *
 * Both sides are read live rather than snapshotted when the tab opened: the saved side comes from
 * the file cache and the working side from the live buffer, so the diff keeps answering "what have
 * I changed" as you keep typing.
 */
export function CompareSavedView({ path, rootPath }: { path: string; rootPath: string }) {
  void rootPath
  const { editorTheme } = useEditorColorTheme()
  const mode = useEditorWorkspaceState((state) => state.diffViewMode)
  const { fileState } = useSelectedFile(path)
  const buffer = useEditorDocumentState((state) => state.liveDocumentsById[path]?.buffer ?? null)
  // Revision, not the buffer object: the buffer is mutated in place, so its identity never changes
  // and would never re-run the diff.
  const revision = useEditorDocumentState((state) => state.documentContentRevisions[path] ?? '')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [view, setView] = useState<EditorDiffView | null>(null)

  const savedText = fileState.status === 'ready' ? fileState.data.content : null
  const files = useMemo(() => {
    if (savedText === null || !buffer) return []

    const languageId = languageIdForFilePath(path)
    return [
      createTextDiff({
        newFile: { languageId, path, text: buffer.materializeFullText() },
        oldFile: { languageId, path, text: savedText },
      }),
    ]
    // `revision` stands in for the buffer's contents; see the selector above.
  }, [buffer, path, revision, savedText])

  const ready = files.length > 0

  useEffect(() => {
    const container = containerRef.current
    if (!ready || !container) return

    const next = new EditorDiffView(container, {
      showFileList: false,
      syntaxBackend: { kind: 'tree-sitter', provider: editorTreeSitterSyntaxProvider() },
      syntaxHighlight: true,
      theme: editorTheme,
    })
    setView(next)

    return () => {
      next.dispose()
      setView(null)
    }
  }, [editorTheme, ready])

  useEffect(() => {
    view?.setFiles(files)
  }, [files, view])

  useEffect(() => {
    view?.setMode(mode)
  }, [mode, view])

  if (fileState.status === 'error') {
    return <CompareNotice message='Could not read the saved file.' tone='error' />
  }
  if (!ready) {
    return (
      <CompareNotice
        message={buffer ? 'Loading saved contents…' : 'Open the file to compare it with disk.'}
      />
    )
  }
  if (files[0]?.hunks.length === 0) {
    return <CompareNotice message='No unsaved changes.' />
  }

  return <div ref={containerRef} className='h-full min-h-0 min-w-0' />
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
