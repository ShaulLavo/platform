import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'

import { DEFAULT_SETTING_VALUES, type SettingId, type SettingsValues } from '@workspace/contracts'

import { expect, test } from '../../../../test/fixtures'
import { EditorDocumentStateContext } from '@/features/editor/state/editor-document-state'
import { createEditorDocumentStore } from '@/features/editor/state/editor-document-state'
import { useAutoSave } from '@/features/editor/hooks/use-auto-save'
import { settingsKeys } from '@/features/settings/query-keys'

function harness(overrides: Partial<SettingsValues>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(settingsKeys.document(), {
    diagnostics: [],
    layers: [],
    revision: '',
    values: { ...DEFAULT_SETTING_VALUES, ...overrides },
  })
  const documentStore = createEditorDocumentStore()

  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(EditorDocumentStateContext.Provider, { value: documentStore }, children),
    )

  return { documentStore, queryClient, wrapper }
}

test('does nothing at all when autosave is off', async ({ client }) => {
  expect(client).toBeDefined()
  const { documentStore, wrapper } = harness({ 'files.autoSave': 'off' })
  const subscribe = documentStore.subscribe
  let subscriptions = 0
  documentStore.subscribe = ((...args: Parameters<typeof subscribe>) => {
    subscriptions += 1

    return subscribe(...args)
  }) as typeof subscribe

  renderHook(() => useAutoSave(), { wrapper })

  // Off means off: no store subscription and no window listener, so the default
  // costs nothing at all.
  expect(subscriptions).toBe(0)
})

test('subscribes to the document store when saving after a delay', async ({ client }) => {
  expect(client).toBeDefined()
  const { documentStore, wrapper } = harness({
    'files.autoSave': 'afterDelay',
    'files.autoSaveDelay': 100,
  })
  const subscribe = documentStore.subscribe
  let subscriptions = 0
  documentStore.subscribe = ((...args: Parameters<typeof subscribe>) => {
    subscriptions += 1

    return subscribe(...args)
  }) as typeof subscribe

  renderHook(() => useAutoSave(), { wrapper })

  await waitFor(() => expect(subscriptions).toBe(1))
})

test('listens for blur when saving on focus change', async ({ client }) => {
  expect(client).toBeDefined()
  const { wrapper } = harness({ 'files.autoSave': 'onWindowChange' })
  const added: string[] = []
  const original = window.addEventListener
  window.addEventListener = ((type: string, ...rest: unknown[]) => {
    added.push(type)

    return (original as never as (...args: unknown[]) => void)(type, ...rest)
  }) as typeof window.addEventListener

  renderHook(() => useAutoSave(), { wrapper })
  window.addEventListener = original

  expect(added).toContain('blur')
})

test('the setting exists with an off default, so nothing changes until asked', ({ client }) => {
  expect(client).toBeDefined()

  expect(DEFAULT_SETTING_VALUES['files.autoSave' as SettingId]).toBe('off')
  expect(DEFAULT_SETTING_VALUES['files.autoSaveDelay' as SettingId]).toBe(1_000)
})
