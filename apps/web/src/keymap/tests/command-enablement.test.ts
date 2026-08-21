import { compareSavedDocumentId } from '@/features/editor/utils/compare-saved-document'
import { conflictDiffDocumentId } from '@/features/editor/utils/conflict-diff-document'
import { refDocumentId } from '@/features/git/utils/ref-document'
import { snapshotDiffDocumentId } from '@/features/git/utils/diff-document'
import { searchBufferDocumentId } from '@/features/search/utils/buffer-document'
import { commandDisabledReason } from '@/keymap/command-enablement'
import { gitFileDiff } from '../../../test/factories/git-diff'
import { expect, test } from '../../../test/fixtures'

test('workspace commands require a workspace unless explicitly optional', () => {
  expect(
    commandDisabledReason('workspace.focusEditor', {
      activeFilePath: null,
      hasWorkspace: false,
    }),
  ).toBe('No workspace open.')
  expect(
    commandDisabledReason('workspace.showCommandPalette', {
      activeFilePath: null,
      hasWorkspace: false,
    }),
  ).toBeNull()
})

test('selected-file commands require a file-backed active editor', () => {
  expect(
    commandDisabledReason('workspace.saveFile', {
      activeFilePath: null,
      hasWorkspace: true,
    }),
  ).toBe('No file-backed surface is active.')
  expect(
    commandDisabledReason('workspace.saveFile', {
      activeFilePath: '/repo/src/app.ts',
      hasWorkspace: true,
    }),
  ).toBeNull()
})

// Enablement has to reject exactly what the save path rejects. When these lists drifted apart the
// palette advertised 'file' commands over a diff tab and the save path then refused them.
test.each([
  ['search buffer', searchBufferDocumentId('/repo')],
  ['compare-saved', compareSavedDocumentId('/repo/src/app.ts')],
  ['git ref', refDocumentId({ path: 'src/app.ts', ref: 'HEAD' })],
  [
    'git diff',
    snapshotDiffDocumentId({
      ...gitFileDiff({ path: 'src/app.ts' }),
      newObjectId: 'b'.repeat(40),
    }),
  ],
  ['conflict diff', conflictDiffDocumentId('conflict-1')],
])('%s documents are not a file-backed surface', (_label, activeFilePath) => {
  expect(commandDisabledReason('workspace.saveFile', { activeFilePath, hasWorkspace: true })).toBe(
    'No file-backed surface is active.',
  )
})
