import { screen, waitFor } from '@testing-library/react'

import { expect, test } from '../../../../test/fixtures'
import { FileList } from '@/features/file-picker/list'
import { FilePickerSessionActionsContext } from '@/features/file-picker/providers/session-actions-context'
import { saveSettings } from '@/features/settings/utils/api'
import type { FsEntry } from '@/lib/file-system-types'
import { renderWithProviders } from '../../../../test/render'

const actions = {
  jumpTo: () => undefined,
  navigateTo: () => undefined,
  revealEntry: () => undefined,
  selectEntry: () => undefined,
}

test('keeps the listbox focused while loading and when a folder is empty', () => {
  const view = renderList([], { status: 'loading' })
  const listbox = screen.getByRole('listbox', { name: 'Folders and files' })

  listbox.focus()
  expect(document.activeElement).toBe(listbox)
  expect(screen.getByRole('status', { name: 'Loading folder' })).toBeInTheDocument()

  view.rerender(pickerList([], { status: 'ready', data: [] }))

  expect(document.activeElement).toBe(listbox)
  expect(screen.getByText('Nothing here')).toBeInTheDocument()
})

test('exposes complete positions for virtualized options', () => {
  const entries = [entry('alpha.ts'), entry('beta.ts'), entry('gamma.ts')]

  renderList(entries, { status: 'ready', data: entries })

  expect(
    screen.getAllByRole('option').map((option) => ({
      position: option.getAttribute('aria-posinset'),
      size: option.getAttribute('aria-setsize'),
    })),
  ).toEqual([
    { position: '1', size: '3' },
    { position: '2', size: '3' },
    { position: '3', size: '3' },
  ])
})

test('keeps cozy painted rows aligned with the virtual list height', async ({ client }) => {
  expect(client).toBeDefined()
  await saveSettings({
    edits: [{ key: 'workbench.density', target: 'user', value: 'cozy' }],
  })
  const entries = [entry('alpha.ts'), entry('beta.ts')]

  renderList(entries, { status: 'ready', data: entries })

  await waitFor(() => {
    const firstOption = screen.getAllByRole('option')[0]
    expect(firstOption?.parentElement).toHaveStyle({ height: '32px' })
  })

  const listbox = screen.getByRole('listbox', { name: 'Folders and files' })
  expect(listbox.firstElementChild).toHaveStyle({ height: '64px' })
})

function renderList(entries: FsEntry[], loadState: Parameters<typeof pickerList>[1]) {
  return renderWithProviders(pickerList(entries, loadState))
}

function pickerList(entries: FsEntry[], loadState: Parameters<typeof FileList>[0]['loadState']) {
  return (
    <FilePickerSessionActionsContext value={actions}>
      <FileList
        entries={entries}
        iconMode='default'
        isBusy={false}
        isSearching={false}
        loadState={loadState}
        mode='folder'
        onDirectoryIntent={() => undefined}
        onEntryDoubleClick={() => undefined}
        onKeyDown={() => undefined}
        onRetry={() => undefined}
        selectedPath={null}
      />
    </FilePickerSessionActionsContext>
  )
}

function entry(path: string): FsEntry {
  return {
    birthtimeMs: 0,
    mtimeMs: 0,
    name: path,
    path,
    size: 0,
    type: 'file',
    version: '1',
  }
}
