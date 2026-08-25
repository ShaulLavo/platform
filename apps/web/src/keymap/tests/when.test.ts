import { expect, test } from '../../../test/fixtures'

import { searchBufferDocumentId } from '@/features/search/utils/buffer-document'
import { settingsJsonDocumentId } from '@/features/settings/utils/json-document'
import {
  commandWhenDisabledReason,
  commandWhenDisabledReasons,
  type CommandWhenSnapshot,
  type CommandWhenTarget,
} from '@/keymap/utils/when'

const enabledSnapshot: CommandWhenSnapshot = {
  activeFilePath: '/repo/src/app.ts',
  activeTabId: 'tab-1',
  chatMode: true,
  workspaceOpen: true,
}

const editorTarget: CommandWhenTarget = { kind: 'editor', writable: true }
const workspaceTarget: CommandWhenTarget = { kind: 'workspace' }

test('evaluates the closed conditions as an ordered AND', () => {
  const snapshot = { ...enabledSnapshot, chatMode: false, workspaceOpen: false }

  expect(commandWhenDisabledReason(['workspaceOpen', 'chatMode'], snapshot, workspaceTarget)).toBe(
    commandWhenDisabledReasons.workspaceOpen,
  )
  expect(commandWhenDisabledReason(['chatMode', 'workspaceOpen'], snapshot, workspaceTarget)).toBe(
    commandWhenDisabledReasons.chatMode,
  )
  expect(commandWhenDisabledReason([], snapshot, workspaceTarget)).toBeNull()
})

test('derives tab and persistence conditions from the captured active tab', () => {
  expect(
    commandWhenDisabledReason(
      ['tabOpen'],
      { ...enabledSnapshot, activeFilePath: null },
      workspaceTarget,
    ),
  ).toBeNull()
  expect(
    commandWhenDisabledReason(
      ['tabOpen'],
      { ...enabledSnapshot, activeTabId: null },
      workspaceTarget,
    ),
  ).toBe(commandWhenDisabledReasons.tabOpen)
  expect(commandWhenDisabledReason(['fileBackedTab'], enabledSnapshot, workspaceTarget)).toBeNull()

  const settingsSnapshot = {
    ...enabledSnapshot,
    activeFilePath: settingsJsonDocumentId('user'),
  }
  expect(commandWhenDisabledReason(['saveableTab'], settingsSnapshot, workspaceTarget)).toBeNull()
  expect(commandWhenDisabledReason(['fileBackedTab'], settingsSnapshot, workspaceTarget)).toBe(
    commandWhenDisabledReasons.fileBackedTab,
  )
})

test('takes editor availability and writability from the resolved target', () => {
  const searchSnapshot = {
    ...enabledSnapshot,
    activeFilePath: searchBufferDocumentId('/repo'),
  }

  expect(commandWhenDisabledReason(['editorTarget'], searchSnapshot, editorTarget)).toBeNull()
  expect(commandWhenDisabledReason(['editorTarget'], searchSnapshot, workspaceTarget)).toBe(
    commandWhenDisabledReasons.editorTarget,
  )
  expect(
    commandWhenDisabledReason(['editorWritable'], searchSnapshot, {
      kind: 'editor',
      writable: false,
    }),
  ).toBe(commandWhenDisabledReasons.editorWritable)
  expect(commandWhenDisabledReason(['editorWritable'], searchSnapshot, editorTarget)).toBeNull()
})
