import { createDiffRegionStore } from '@singapor/diff'
import { useMemo, useRef, useState } from 'react'

import { DiffEditor } from '@/features/editor/components/diff-editor'
import { useDiffOwnedText } from '@/features/editor/hooks/use-diff-owned-text'
import type { DiffDocumentInfo } from '@/features/git/utils/diff-document'
import { useDiffDocumentDiffs } from '../hooks/use-diff-document-diffs'
import { emptyDiffNotice, unrenderableDiffNotice } from '../utils/diff-presentation'
import { editorDiffFiles } from '../utils/editor-diff-files'
import { DiffLineCommentAction } from './diff-line-comment-action'
import { DiffNotice } from './diff-notice'
import { useSettingValue } from '@/features/settings/hooks/use-setting-value'

/**
 * Renders a `git-diff:` document as real editors carrying the diff plugin, so a
 * diff gets the same tree-sitter highlighting, theming and virtualized scrolling
 * a file does. Snapshot ids (the git panel) resolve to one file; checkpoint ids
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
  const mode = useSettingValue('editor.diff.viewMode')
  const containerRef = useRef<HTMLDivElement | null>(null)
  // One store, read by both split panes and by the comment layer. The layer does
  // not keep a copy of which regions are open — the mirror it used to keep was
  // keyed by hunk ordinal, which a trailing-tail region does not have.
  const [regions] = useState(createDiffRegionStore)
  // Stable identity is required: this is pushed into the plugin, and a fresh
  // array each render would re-project the diff and throw away scroll position.
  const files = useMemo(() => editorDiffFiles(diffs), [diffs])
  // A binary file and a pure rename both come back as a file entry with no
  // hunks, so "we got diffs" is not the same as "there is something to draw".
  //
  // One `find` rather than a `some` beside a `files[0]`: those are two decisions that have to agree
  // and nothing made them. A first entry with no hunks and a second with some would have reported
  // ready and then drawn the empty one. No route produces that today — the patch parser drops
  // hunkless entries and the compare-saved path is single-file — so this is a latent mismatch being
  // closed rather than a bug being fixed. The file list is off either way, so a checkpoint diff
  // touching several files deliberately shows one.
  const file = files.find((entry) => entry.hunks.length > 0)
  // What an editor tab currently holds for this path, if anything. That is the only text a
  // language server can be asked about, and comparing it to the diff's new side is what makes an
  // answer true — see `diffQueryTargetAt`. Called before the early returns below: hooks are not
  // conditional.
  const languageServer = useDiffOwnedText(file?.newPath || file?.path || null, rootPath)

  if (failure) return <DiffNotice message={failure} tone='error' />
  if (pending) return <DiffNotice message='Loading diff…' />
  if (diffs.length === 0) return <DiffNotice message={emptyDiffNotice(documentInfo, rootPath)} />
  if (!file) {
    return <DiffNotice message={unrenderableDiffNotice(diffs, documentInfo, rootPath)} />
  }

  return (
    <div className='relative h-full min-h-0 w-full min-w-0 overflow-hidden'>
      {/* The ref is on the panes and not on the wrapper the toolbar shares: the
          comment layer listens for `mousedown` in capture, and a press on its own
          "Ask" button would otherwise clear the selection before the click landed. */}
      <div className='h-full min-h-0 w-full min-w-0' ref={containerRef}>
        <DiffEditor file={file} languageServer={languageServer} mode={mode} regions={regions} />
      </div>
      <DiffLineCommentAction file={file} hostRef={containerRef} key={file.path} regions={regions} />
    </div>
  )
}
