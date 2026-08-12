import { editorTextMenu } from '@/features/editor/utils/text-menu'
import type { MenuCommandItem } from '@/features/menus/utils/model'
import { commandDisabledReason } from '@/components/command-palette/command-palette-utils'
import { expect, test } from '../../../../../test/fixtures'

test('sections run navigate, edit, file, then palette', () => {
  expect(editorTextMenu().map((entry) => entry.id)).toEqual(['navigate', 'edit', 'file', 'palette'])
})

// Revert File is intentionally absent: our revert rebuilds the buffer and discards undo history,
// so it stays in the palette rather than one misclick away.
test('the file section offers Save and not Revert', () => {
  expect(labels('file')).toEqual(['Save'])
})

test('the navigate section leads with the definition jumps, then the wider searches', () => {
  expect(labels('navigate')).toEqual([
    'Go to Definition',
    'Go to Type Definition',
    'Go to Implementations',
    'Find All References',
    'Peek Definition',
    'Open Definition to the Side',
  ])
})

test('the edit section offers occurrences before the two comment toggles', () => {
  expect(labels('edit')).toEqual([
    'Change All Occurrences',
    'Toggle Line Comment',
    'Toggle Block Comment',
  ])
})

test('the palette section is the single escape hatch to every other command', () => {
  expect(labels('palette')).toEqual(['Command Palette…'])
})

test('every item runs a command rather than a local callback', () => {
  expect(items().every((item) => item.kind === 'command')).toBe(true)
})

test('the navigate and edit items route to the editor command handlers', () => {
  expect(commands('navigate')).toEqual([
    'editor.goToDefinition',
    'editor.editor.action.goToTypeDefinition',
    'editor.editor.action.goToImplementation',
    'editor.editor.action.goToReferences',
    'editor.editor.action.peekDefinition',
    'editor.editor.action.revealDefinitionAside',
  ])
  expect(commands('edit')).toEqual([
    'editor.editor.action.changeAll',
    'editor.editor.action.commentLine',
    'editor.editor.action.blockComment',
  ])
})

test('nothing is a placeholder for a feature that does not exist', () => {
  expect(items().filter((item) => item.unavailable)).toEqual([])
})

test('every editor item is disabled while no file-backed surface is active', () => {
  const context = { activeFilePath: null, hasWorkspace: true }

  expect(
    [...commands('navigate'), ...commands('edit')].every(
      (command) => commandDisabledReason(command, context) !== null,
    ),
  ).toBe(true)
})

test('the palette item survives a workspace with nothing open', () => {
  const context = { activeFilePath: null, hasWorkspace: false }

  expect(commandDisabledReason('workspace.showCommandPalette', context)).toBeNull()
})

function items(): readonly MenuCommandItem[] {
  return editorTextMenu().flatMap((entry) => entry.items.filter(Boolean) as MenuCommandItem[])
}

function sectionItems(sectionId: string): readonly MenuCommandItem[] {
  const entry = editorTextMenu().find((candidate) => candidate.id === sectionId)

  return (entry?.items ?? []).filter(Boolean) as MenuCommandItem[]
}

function labels(sectionId: string) {
  return sectionItems(sectionId).map((item) => item.label)
}

function commands(sectionId: string) {
  return sectionItems(sectionId).map((item) => item.command)
}
