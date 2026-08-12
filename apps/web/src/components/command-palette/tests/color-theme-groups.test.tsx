import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { vi } from 'vitest'

import { expect, test } from '../../../../test/fixtures'
import { renderWithProviders } from '../../../../test/render'
import { ColorThemeGroups } from '@/components/command-palette/color-theme-groups'
import {
  CommandPaletteActionsContext,
  type CommandPaletteActions,
} from '@/components/command-palette/providers/actions-context'
import { Command } from '@workspace/ui/components/command'

test('lists the bundled VSCode themes grouped by dark and light', () => {
  const actions = commandPaletteActions()

  renderWithProviders(
    <CommandPaletteActionsProvider actions={actions}>
      <Command>
        <ColorThemeGroups />
      </Command>
    </CommandPaletteActionsProvider>,
  )

  expect(screen.getByText('Color Theme — Dark')).toBeInTheDocument()
  expect(screen.getByText('Color Theme — Light')).toBeInTheDocument()
  expect(screen.getByText('Monokai')).toBeInTheDocument()
  expect(screen.getByText('GitHub Light')).toBeInTheDocument()
})

test('marks the selected theme of the active color mode as active', () => {
  const actions = commandPaletteActions()

  renderWithProviders(
    <CommandPaletteActionsProvider actions={actions}>
      <Command>
        <ColorThemeGroups />
      </Command>
    </CommandPaletteActionsProvider>,
  )

  // renderWithProviders defaults to dark mode, whose default theme is dark-plus.
  const activeBadge = screen.getByText('active')
  expect(activeBadge.closest('[cmdk-item]')).toBe(
    screen.getByText('Dark Plus').closest('[cmdk-item]'),
  )
})

test('applies the chosen theme on select', async () => {
  const user = userEvent.setup()
  const actions = commandPaletteActions()

  renderWithProviders(
    <CommandPaletteActionsProvider actions={actions}>
      <Command>
        <ColorThemeGroups />
      </Command>
    </CommandPaletteActionsProvider>,
  )

  await user.click(screen.getByText('Monokai'))

  expect(actions.selectColorTheme).toHaveBeenCalledWith('monokai')
})

test('previews a theme on hover without selecting it', () => {
  const actions = commandPaletteActions()

  renderWithProviders(
    <CommandPaletteActionsProvider actions={actions}>
      <Command>
        <ColorThemeGroups />
      </Command>
    </CommandPaletteActionsProvider>,
  )

  fireEvent.pointerEnter(screen.getByText('Monokai'))

  expect(actions.previewColorTheme).toHaveBeenCalledWith('monokai')
  expect(actions.selectColorTheme).not.toHaveBeenCalled()
})

test('does not preview the already active theme on hover', () => {
  const actions = commandPaletteActions()

  renderWithProviders(
    <CommandPaletteActionsProvider actions={actions}>
      <Command>
        <ColorThemeGroups />
      </Command>
    </CommandPaletteActionsProvider>,
  )

  // renderWithProviders defaults to dark mode, whose default theme is dark-plus.
  fireEvent.pointerEnter(screen.getByText('Dark Plus'))

  expect(actions.previewColorTheme).not.toHaveBeenCalled()
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
    previewColorTheme: vi.fn(),
    selectColorTheme: vi.fn(),
    selectCommand: vi.fn(),
    selectFile: vi.fn(),
    selectPlatformCommand: vi.fn(),
    selectSession: vi.fn(),
    selectSymbol: vi.fn(),
    startSessionDraft: vi.fn(),
  }
}
