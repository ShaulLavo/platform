import { searchBufferDocumentId } from '@/features/search/utils/buffer-document'
import { commandDisabledReason, fileBackedPath } from '@/keymap/command-enablement'
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
      activeFilePath: searchBufferDocumentId('/repo'),
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

test('file-backed paths exclude transient search buffers', () => {
  expect(fileBackedPath(null)).toBeNull()
  expect(fileBackedPath(searchBufferDocumentId('/repo'))).toBeNull()
  expect(fileBackedPath('/repo/src/app.ts')).toBe('/repo/src/app.ts')
})
