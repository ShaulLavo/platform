import { screen, waitFor } from '@testing-library/react'
import type { FileResult } from '@workspace/contracts'

import { CompareSavedView } from '@/features/editor/components/compare-saved-view'
import {
  EditorDocumentStateContext,
  createEditorDocumentStore,
} from '@/features/editor/state/document-state'
import { fileSystemKeys } from '@/lib/query-keys'
import { expect, test } from '../../../../../test/fixtures'
import { createTestQueryClient, renderWithProviders } from '../../../../../test/render'

// The second of the two mount sites, and the harsher one: both sides are read live, so every
// keystroke rebuilds the `DiffFile` and pushes a new buffer. Its own logic is the three notices and
// the buffer-versus-disk model it hands to `DiffEditor`.

const SAVED = 'alpha\nbeta\ngamma\n'
const EDITED = 'alpha\nbeta changed\ngamma\n'

test('a buffer that differs from disk is shown as a diff', async () => {
  stubHighlightApi()
  renderCompare({ buffer: EDITED, saved: SAVED })

  await waitFor(() => expect(diffRowTexts().length).toBeGreaterThan(0))
  expect(diffRowTexts()).toContain('beta')
  expect(diffRowTexts()).toContain('beta changed')
})

test('a buffer that matches disk says there is nothing to compare', async () => {
  stubHighlightApi()
  renderCompare({ buffer: SAVED, saved: SAVED })

  expect(await screen.findByText('No unsaved changes.')).toBeInTheDocument()
})

test('a file that was never opened asks for it to be opened', async () => {
  stubHighlightApi()
  renderCompare({ buffer: null, saved: SAVED })

  expect(await screen.findByText('Open the file to compare it with disk.')).toBeInTheDocument()
})

function renderCompare({ buffer, saved }: { buffer: string | null; saved: string }) {
  const path = 'repo/a.ts'
  const queryClient = createTestQueryClient()
  // Seeded rather than served: this suite is about what the component builds from the two sides,
  // and a real read would make every case wait on a round trip.
  queryClient.setQueryData(fileSystemKeys.fileSnapshot(path), fileResult(path, saved))
  const store = createEditorDocumentStore()
  if (buffer !== null) store.getState().ensureLiveEditorDocument(fileResult(path, buffer))

  return renderWithProviders(
    <EditorDocumentStateContext.Provider value={store}>
      <CompareSavedView path={path} rootPath='repo' />
    </EditorDocumentStateContext.Provider>,
    { queryClient },
  )
}

function diffRowTexts() {
  return [
    ...document.querySelectorAll<HTMLElement>('.editor-diff-pane [data-editor-virtual-row]'),
  ].map((row) => row.textContent ?? '')
}

function fileResult(path: string, content: string): FileResult {
  return { content, mtimeMs: 1, path, size: content.length, version: `v-${content.length}` }
}

function stubHighlightApi() {
  class HighlightStub extends Set<unknown> {}
  Object.assign(globalThis, { Highlight: HighlightStub })
  Object.assign(globalThis.CSS ?? {}, { highlights: new Map() })
}
