import { QueryClient } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'

import { expect, test } from '../../../../test/fixtures'
import { saveSettings } from '@/features/settings/utils/api'
import { useSettingsStream } from '../hooks/use-settings-stream'
import { settingsKeys } from '@/features/settings/utils/query-keys'

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

test('lands a change made by another writer in this tab’s cache', async ({ client }) => {
  expect(client).toBeDefined()
  const queryClient = new QueryClient()
  renderHook(() => useSettingsStream(), { wrapper: wrapper(queryClient) })

  // Stands in for the other writer: a second window, or a hand-edit to the file.
  // Either way it reaches this tab over the stream, not by polling.
  await saveSettings({ edits: [{ key: 'workbench.colorTheme', target: 'user', value: 'dark' }] })

  await waitFor(() => {
    const cached = queryClient.getQueryData(settingsKeys.document())
    expect(cached).toMatchObject({ values: { 'workbench.colorTheme': 'dark' } })
  })

  queryClient.clear()
})
