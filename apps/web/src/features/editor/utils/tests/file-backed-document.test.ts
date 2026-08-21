import { describe, expect, it } from 'vitest'

import { compareSavedDocumentId } from '@/features/editor/utils/compare-saved-document'
import { conflictDiffDocumentId } from '@/features/editor/utils/conflict-diff-document'
import {
  editorBackedDocumentPath,
  fileBackedDocumentPath,
} from '@/features/editor/utils/file-backed-document'
import { snapshotDiffDocumentId } from '@/features/git/utils/diff-document'
import type { FileDiff } from '@/features/git/utils/types'
import { refDocumentId } from '@/features/git/utils/ref-document'
import { searchBufferDocumentId } from '@/features/search/utils/buffer-document'
import { settingsDocumentId } from '@/features/settings/utils/document'

describe('fileBackedDocumentPath', () => {
  it('returns ordinary filesystem paths', () => {
    expect(fileBackedDocumentPath('/repo/src/app.ts')).toBe('/repo/src/app.ts')
  })

  it('filters non-file editor document ids', () => {
    expect(fileBackedDocumentPath(snapshotDiffDocumentId(snapshotDiff('/repo/src/app.ts')))).toBe(
      null,
    )
    expect(fileBackedDocumentPath(conflictDiffDocumentId('conflict-1'))).toBe(null)
    expect(fileBackedDocumentPath(searchBufferDocumentId('/repo'))).toBe(null)
    expect(fileBackedDocumentPath(compareSavedDocumentId('/repo/src/app.ts'))).toBe(null)
    expect(fileBackedDocumentPath(settingsDocumentId())).toBe(null)
  })

  // Prefix, not payload: a scheme whose body will not decode is still that scheme. Running the
  // parsers here reported one as an ordinary path, which is a save away from writing a file named
  // `git-diff:%%%`.
  it('filters a synthetic id whose payload is malformed', () => {
    expect(fileBackedDocumentPath('git-diff:%%%')).toBe(null)
    expect(fileBackedDocumentPath('git-ref:not-json')).toBe(null)
    expect(fileBackedDocumentPath('conflict-diff:%%%')).toBe(null)
  })
})

/**
 * The surfaces that hold an editor are not the surfaces that hold a file.
 *
 * Conflict and git-ref tabs attach a view by document id instead of by file path, so an
 * `editor.*` command reaches them while a save does not. A diff is the interesting exclusion: it
 * is drawn by real `Editor`s, but they never register with `setActiveEditorCommandDispatch`, so
 * there is nothing for a dispatch to land on.
 */
describe('editorBackedDocumentPath', () => {
  const conflict = conflictDiffDocumentId('conflict-1')
  const ref = refDocumentId({ path: 'src/app.ts', ref: 'HEAD' })

  // The settings tab renders a real editor in its JSON view. Nothing in the id
  // says which view is showing, so it answers yes and the editor commands are a
  // no-op over the form.
  it('accepts the settings tab, which holds an editor in one of its two views', () => {
    expect(editorBackedDocumentPath(settingsDocumentId())).toBe(settingsDocumentId())
    expect(fileBackedDocumentPath(settingsDocumentId())).toBe(null)
  })

  it('accepts the unsavable surfaces that still own an editor', () => {
    expect(editorBackedDocumentPath(conflict)).toBe(conflict)
    expect(editorBackedDocumentPath(ref)).toBe(ref)
    expect(fileBackedDocumentPath(conflict)).toBe(null)
    expect(fileBackedDocumentPath(ref)).toBe(null)
  })

  it('accepts ordinary files and refuses the surfaces with no dispatchable editor', () => {
    expect(editorBackedDocumentPath('/repo/src/app.ts')).toBe('/repo/src/app.ts')
    expect(editorBackedDocumentPath(snapshotDiffDocumentId(snapshotDiff('/repo/src/app.ts')))).toBe(
      null,
    )
    expect(editorBackedDocumentPath(compareSavedDocumentId('/repo/src/app.ts'))).toBe(null)
    expect(editorBackedDocumentPath(searchBufferDocumentId('/repo'))).toBe(null)
  })
})

// A diff is drawn by real, editable-looking `Editor`s now. What keeps one from being saved is not
// the renderer but the document id — `editability: 'readonly'` and `storeSync: 'none'` are the
// belt, and this is the braces. `save.ts` used to carry a second copy of this predicate; 8a3f775
// consolidated them, so asserting the one function now covers the save path too.
describe('a diff document is not file-backed, whichever scheme it uses', () => {
  it('refuses both diff document schemes', () => {
    expect(fileBackedDocumentPath(snapshotDiffDocumentId(snapshotDiff('/repo/src/app.ts')))).toBe(
      null,
    )
    expect(fileBackedDocumentPath(compareSavedDocumentId('/repo/src/app.ts'))).toBe(null)
  })
})

function snapshotDiff(path: string): FileDiff & { newObjectId: string; oldObjectId: string } {
  return {
    hunks: [],
    newObjectId: 'b'.repeat(40),
    oldObjectId: 'a'.repeat(40),
    patch: '',
    path,
    staged: false,
  }
}
