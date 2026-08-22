import type { GitFileDiff } from '@workspace/contracts'
import { createTextDiff, parseGitPatch, type DiffFile } from '@singapor/diff'

import { languageIdForFilePath } from '@/features/editor/utils/file-path'

/**
 * Translates our git diffs into the editor's diff model.
 *
 * Whole-file text is preferred over the patch wherever the server sent it: a
 * patch carries only its own hunks, so a view built from one can never expand
 * past the context git happened to choose, and the syntax pass would be
 * highlighting a file with holes in it. The patch stays as the fallback for
 * diffs the server could not read as text.
 */
export function editorDiffFiles(diffs: readonly GitFileDiff[]): DiffFile[] {
  return diffs.flatMap(toEditorDiffFiles)
}

/**
 * The one file the pane draws.
 *
 * A file with hunks is the normal answer. A whole-file diff with no hunks is a rename or a mode
 * change, and its text is still the thing the reader opened — the diff editor draws it as unchanged
 * rather than replacing the file with a sentence about it. A patch-only entry with no hunks carries
 * no text at all, so there is nothing there to draw.
 */
export function renderableDiffFile(files: readonly DiffFile[]): DiffFile | null {
  return files.find((file) => file.hunks.length > 0) ?? files.find(hasWholeFileText) ?? null
}

function hasWholeFileText(file: DiffFile) {
  if (file.isPartial) return false

  return file.newLines.length > 0 || file.oldLines.length > 0
}

function toEditorDiffFiles(diff: GitFileDiff): DiffFile[] {
  if (diff.oldText === undefined && diff.newText === undefined) {
    return [...parseGitPatch(diff.patch, { cacheKey: diffCacheKey(diff) })]
  }

  return [
    createTextDiff({
      newFile: newSide(diff),
      oldFile: oldSide(diff),
    }),
  ]
}

function oldSide(diff: GitFileDiff) {
  if (diff.oldFileMissing) return null

  const path = diff.oldPath ?? diff.path
  return {
    languageId: languageIdForFilePath(path),
    objectId: diff.oldObjectId,
    path,
    text: diff.oldText ?? '',
  }
}

function newSide(diff: GitFileDiff) {
  if (diff.newFileMissing) return null

  return {
    languageId: languageIdForFilePath(diff.path),
    objectId: diff.newObjectId,
    path: diff.path,
    text: diff.newText ?? '',
  }
}

/**
 * Object ids address content, so this key stays valid for as long as the blobs
 * do — which is what lets the editor reuse a parsed diff across reopenings of
 * the same tab.
 */
function diffCacheKey(diff: GitFileDiff) {
  return `${diff.oldObjectId ?? ''}:${diff.newObjectId ?? ''}:${diff.path}`
}
