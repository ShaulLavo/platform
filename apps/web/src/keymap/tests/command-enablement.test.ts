import { compareSavedDocumentId } from '@/features/editor/utils/compare-saved-document'
import { conflictDiffDocumentId } from '@/features/editor/utils/conflict-diff-document'
import { refDocumentId } from '@/features/git/utils/ref-document'
import { snapshotDiffDocumentId } from '@/features/git/utils/diff-document'
import { searchBufferDocumentId } from '@/features/search/utils/buffer-document'
import { settingsDocumentId } from '@/features/settings/utils/document'
import { settingsJsonDocumentId } from '@/features/settings/utils/json-document'
import { commandDisabledReason } from '@/keymap/command-enablement'
import { gitFileDiff } from '../../../test/factories/git-diff'
import { expect, test } from '../../../test/fixtures'

// One command per requirement, so a case below reads as "what does the palette show on this tab".
const REVERT = 'workspace.revertFile' // requires 'file'
const SAVE = 'workspace.saveFile' // requires 'saveable'
const UNDO = 'editor.undo' // requires 'editor'
const CLOSE = 'workspace.closeCurrentTab' // requires 'tab'
// Handled by the language-server plugin and absent from the command table, so this is the
// `commandRequirement` fallback rather than a registry lookup. The editor text menu is built
// entirely from ids like this one.
const RENAME = 'editor.editor.action.rename'

const NO_FILE = 'No file-backed surface is active.'
const NO_SAVE = 'Nothing here can be saved.'
const NO_EDITOR = 'No text editor is active.'
const NO_TAB = 'No editor tab is open.'

test('workspace commands require a workspace unless explicitly optional', () => {
  expect(commandDisabledReason('workspace.focusEditor', context(null, false))).toBe(
    'No workspace open.',
  )
  expect(commandDisabledReason('workspace.showCommandPalette', context(null, false))).toBeNull()
})

test('an ordinary file satisfies every requirement', () => {
  const activeFilePath = '/repo/src/app.ts'
  expect(commandDisabledReason(REVERT, context(activeFilePath))).toBeNull()
  expect(commandDisabledReason(SAVE, context(activeFilePath))).toBeNull()
  expect(commandDisabledReason(UNDO, context(activeFilePath))).toBeNull()
  expect(commandDisabledReason(RENAME, context(activeFilePath))).toBeNull()
  expect(commandDisabledReason(CLOSE, context(activeFilePath))).toBeNull()
})

test('no tab at all disables every requirement above workspace', () => {
  expect(commandDisabledReason(REVERT, context(null))).toBe(NO_FILE)
  expect(commandDisabledReason(SAVE, context(null))).toBe(NO_SAVE)
  expect(commandDisabledReason(UNDO, context(null))).toBe(NO_EDITOR)
  expect(commandDisabledReason(CLOSE, context(null))).toBe(NO_TAB)
})

/**
 * The whole point of splitting the requirement: these four columns used to be one, so every row
 * with a `null` outside the first column was a command the palette greyed out over a tab that could
 * run it, and the `settings` row was the reverse — a Save the palette advertised over a page with
 * nothing to save.
 *
 * `file` is a path on disk, `saveable` is anywhere the bytes can be written back — the raw
 * settings.json buffer goes through the settings route and has no path — `editor` is what an
 * `editor.*` dispatch can reach (see `editorBackedDocumentPath` for why a diff is not that despite
 * being drawn by real editors), and `tab` is anything with a close button.
 */
test.each([
  ['search buffer', searchBufferDocumentId('/repo'), NO_FILE, NO_SAVE, NO_EDITOR, null],
  ['compare-saved', compareSavedDocumentId('/repo/src/app.ts'), NO_FILE, NO_SAVE, NO_EDITOR, null],
  ['git diff', gitDiffDocumentId(), NO_FILE, NO_SAVE, NO_EDITOR, null],
  // The settings tab holds a real editor whenever its JSON view is showing, and
  // the id cannot say which view that is — so it answers yes to both.
  ['settings', settingsDocumentId(), NO_FILE, null, null, null],
  ['git ref', refDocumentId({ path: 'src/app.ts', ref: 'HEAD' }), NO_FILE, NO_SAVE, null, null],
  ['conflict diff', conflictDiffDocumentId('conflict-1'), NO_FILE, NO_SAVE, null, null],
  ['settings json buffer', settingsJsonDocumentId('user'), NO_FILE, null, null, null],
])(
  'a %s tab: what the palette shows for file, save, editor and tab commands',
  (_label, activeFilePath, file, save, editor, tab) => {
    expect(commandDisabledReason(REVERT, context(activeFilePath))).toBe(file)
    expect(commandDisabledReason(SAVE, context(activeFilePath))).toBe(save)
    expect(commandDisabledReason(UNDO, context(activeFilePath))).toBe(editor)
    expect(commandDisabledReason(RENAME, context(activeFilePath))).toBe(editor)
    expect(commandDisabledReason(CLOSE, context(activeFilePath))).toBe(tab)
  },
)

// Prefix matching, not parsing: a body that will not decode is still that scheme, and answering
// 'file' for it is how a malformed id reaches the save path as if it named something on disk.
test('a synthetic id with an undecodable payload is still not a file', () => {
  expect(commandDisabledReason(REVERT, context('git-diff:%%%'))).toBe(NO_FILE)
  expect(commandDisabledReason(REVERT, context('git-ref:not-json'))).toBe(NO_FILE)
  expect(commandDisabledReason(SAVE, context('git-diff:%%%'))).toBe(NO_SAVE)
})

function context(activeFilePath: string | null, hasWorkspace = true) {
  return { activeFilePath, hasWorkspace }
}

function gitDiffDocumentId() {
  return snapshotDiffDocumentId({
    ...gitFileDiff({ path: 'src/app.ts' }),
    newObjectId: 'b'.repeat(40),
  })
}
