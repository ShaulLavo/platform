import type { VscodeThemeDefinition, VscodeThemeRegistration } from '@singapor/core/shiki'
import { act, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, vi } from 'vitest'

import { expect, test } from '../../../../../test/fixtures'

type PendingThemeLoad = {
  readonly load: () => Promise<VscodeThemeRegistration>
  readonly resolve: (registration: VscodeThemeRegistration) => void
}

afterEach(() => {
  vi.doUnmock('@workspace/client-core/themes/registration')
  vi.resetModules()
})

test('a late older theme load cannot overwrite the newer applied theme id', async () => {
  const pending = new Map<string, PendingThemeLoad>()
  vi.resetModules()
  vi.doMock('@workspace/client-core/themes/registration', async () => {
    const actual = await vi.importActual<
      typeof import('@workspace/client-core/themes/registration')
    >('@workspace/client-core/themes/registration')

    return {
      ...actual,
      loadVscodeThemeRegistration: (definition: VscodeThemeDefinition | string) => {
        const themeId = typeof definition === 'string' ? definition : definition.id
        let resolve!: (registration: VscodeThemeRegistration) => void
        const promise = new Promise<VscodeThemeRegistration>((next) => {
          resolve = next
        })
        pending.set(themeId, {
          load: () => actual.loadVscodeThemeRegistration(definition),
          resolve,
        })
        return promise
      },
    }
  })

  const store = await import('@/features/editor/state/color-theme-store')
  const { useEditorColorTheme } = await import('@/features/editor/hooks/use-editor-color-theme')
  const { renderWithProviders } = await import('../../../../../test/render')
  store.resetEditorColorThemeStore()
  store.setSelectedEditorThemeId('dark', 'monokai')

  function AppliedThemeProbe() {
    const theme = useEditorColorTheme()

    return createElement('output', {
      'data-applied-theme-id': theme.appliedThemeId ?? '',
      'data-selected-theme-id': theme.selectedThemeId,
    })
  }

  const view = renderWithProviders(createElement(AppliedThemeProbe), { command: false })
  await waitFor(() => expect(pending.has('monokai')).toBe(true))

  act(() => store.setSelectedEditorThemeId('dark', 'dracula'))
  await waitFor(() => expect(pending.has('dracula')).toBe(true))
  await resolvePendingTheme(pending, 'dracula')
  await waitFor(() => {
    expect(view.getByRole('status')).toHaveAttribute('data-applied-theme-id', 'dracula')
    expect(view.getByRole('status')).toHaveAttribute('data-selected-theme-id', 'dracula')
  })

  await resolvePendingTheme(pending, 'monokai')
  await Promise.resolve()

  expect(view.getByRole('status')).toHaveAttribute('data-applied-theme-id', 'dracula')
})

async function resolvePendingTheme(
  pending: ReadonlyMap<string, PendingThemeLoad>,
  themeId: string,
): Promise<void> {
  const load = pending.get(themeId)
  expect(load, `Missing deferred theme load: ${themeId}`).toBeDefined()
  if (!load) return

  const registration = await load.load()
  await act(async () => load.resolve(registration))
}
