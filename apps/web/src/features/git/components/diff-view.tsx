import { DiffView as EditorDiffView } from '@singapor/diff'
import { useEffect, useMemo, useRef, useState } from 'react'

import { editorTreeSitterSyntaxProvider } from '@/features/editor/editor-plugins'
import { useEditorColorTheme } from '@/features/editor/hooks/use-editor-color-theme'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import type { DiffDocumentInfo } from '../diff-document'
import { useDiffDocumentDiffs } from '../hooks/use-diff-document-diffs'
import { emptyDiffNotice, unrenderableDiffNotice } from '../utils/diff-presentation'
import { editorDiffFiles } from '../utils/editor-diff-files'
import { DiffNotice } from './diff-notice'

/**
 * Renders a `git-diff:` document through the editor's own diff view, so a diff
 * gets the same tree-sitter highlighting, theming and virtualized scrolling a
 * file does. Snapshot ids (the git panel) resolve to one file; checkpoint ids
 * resolve to one file for a `file` scope and to every touched file for a `turn`
 * or `thread` scope.
 */
export function DiffView({
  documentInfo,
  rootPath,
}: {
  documentInfo: DiffDocumentInfo
  rootPath: string
}) {
  const { diffs, failure, pending } = useDiffDocumentDiffs(documentInfo)
  const { editorTheme } = useEditorColorTheme()
  const mode = useEditorWorkspaceState((state) => state.diffViewMode)
  const containerRef = useRef<HTMLDivElement | null>(null)
  // The view lives in state, not a ref, so that rebuilding it re-runs the two
  // effects below — that is what re-applies the current files and mode instead
  // of leaving a fresh view empty.
  const [view, setView] = useState<EditorDiffView | null>(null)
  // Stable identity is required: this feeds a `setFiles` effect, and a fresh
  // array each render would re-push the diff and throw away scroll position.
  const files = useMemo(() => editorDiffFiles(diffs), [diffs])
  // A binary file and a pure rename both come back as a file entry with no
  // hunks, so "we got diffs" is not the same as "there is something to draw".
  const ready = !failure && !pending && files.some((file) => file.hunks.length > 0)

  // `ready` is a dependency because the container only exists once there is a
  // diff to show — without it the view would never be built for the very first
  // load, only for a later theme change. The theme is a construction option
  // with no setter, so a colour-mode change rebuilds; files and mode are pushed
  // separately, which is what keeps scroll position across a refetch.
  useEffect(() => {
    const container = containerRef.current
    if (!ready || !container) return

    const next = new EditorDiffView(container, {
      // The tab already names the file, and a checkpoint diff is scoped to one
      // turn — a file list beside it would just repeat the tab or the timeline.
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

  if (failure) return <DiffNotice message={failure} tone='error' />
  if (pending) return <DiffNotice message='Loading diff…' />
  if (diffs.length === 0) return <DiffNotice message={emptyDiffNotice(documentInfo, rootPath)} />
  if (!ready) {
    return <DiffNotice message={unrenderableDiffNotice(diffs, documentInfo, rootPath)} />
  }

  return <div className='h-full min-h-0 w-full min-w-0 overflow-hidden' ref={containerRef} />
}
