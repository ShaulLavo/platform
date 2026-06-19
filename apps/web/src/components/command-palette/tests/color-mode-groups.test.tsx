import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { expect, test } from '../../../../test/fixtures'
import { ColorModeGroups } from '@/components/command-palette/color-mode-groups'
import {
  CommandPaletteActionsContext,
  type CommandPaletteActions,
} from '@/components/command-palette/providers/actions-context'
import { Command } from '@workspace/ui/components/command'
import type { ReactNode } from 'react'

test('previews color mode on hover without selecting the command', () => {
  const actions = commandPaletteActions()

  render(
    <CommandPaletteActionsProvider actions={actions}>
      <Command>
        <ColorModeGroups currentTheme='light' />
      </Command>
    </CommandPaletteActionsProvider>,
  )

  fireEvent.pointerEnter(screen.getByText('Dark'))

  expect(actions.previewPlatformCommand).toHaveBeenCalledWith('workspace.setDarkTheme')
  expect(actions.selectPlatformCommand).not.toHaveBeenCalled()
})

test('does not preview the already active color mode', () => {
  const actions = commandPaletteActions()

  render(
    <CommandPaletteActionsProvider actions={actions}>
      <Command>
        <ColorModeGroups currentTheme='dark' />
      </Command>
    </CommandPaletteActionsProvider>,
  )

  fireEvent.pointerEnter(screen.getByText('Dark'))

  expect(actions.previewPlatformCommand).not.toHaveBeenCalled()
})

function CommandPaletteActionsProvider({
  actions,
  children,
}: {
  readonly actions: CommandPaletteActions
  readonly children: ReactNode
}) {
  return <CommandPaletteActionsContext value={actions}>{children}</CommandPaletteActionsContext>
}

function commandPaletteActions(): CommandPaletteActions {
  return {
    previewPlatformCommand: vi.fn(),
    selectCommand: vi.fn(),
    selectFile: vi.fn(),
    selectPlatformCommand: vi.fn(),
    selectSymbol: vi.fn(),
  }
}
