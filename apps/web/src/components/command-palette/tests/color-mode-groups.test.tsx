import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { expect, test } from '../../../../test/fixtures'
import { ColorModeGroups } from '@/components/command-palette/color-mode-groups'
import { Command } from '@workspace/ui/components/command'

test('previews color mode on hover without selecting the command', () => {
  const onPreview = vi.fn()
  const onSelect = vi.fn()

  render(
    <Command>
      <ColorModeGroups currentTheme='light' onPreview={onPreview} onSelect={onSelect} />
    </Command>,
  )

  fireEvent.pointerEnter(screen.getByText('Dark'))

  expect(onPreview).toHaveBeenCalledWith('workspace.setDarkTheme')
  expect(onSelect).not.toHaveBeenCalled()
})

test('does not preview the already active color mode', () => {
  const onPreview = vi.fn()

  render(
    <Command>
      <ColorModeGroups currentTheme='dark' onPreview={onPreview} onSelect={() => undefined} />
    </Command>,
  )

  fireEvent.pointerEnter(screen.getByText('Dark'))

  expect(onPreview).not.toHaveBeenCalled()
})
