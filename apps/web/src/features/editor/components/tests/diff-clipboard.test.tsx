import { render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import type { Editor } from '@singapor/core'
import {
  createDiffRegionStore,
  createStackedProjection,
  createTextDiff,
  type DiffRenderRow,
} from '@singapor/diff'

import { DiffPane } from '@/features/editor/components/diff-pane'
import { expect, test } from '../../../../../test/fixtures'

// The point of holding the diff in a real document rather than as injected rows: a deletion is an
// ordinary buffer line, so it selects and copies like any other text. Nothing here mocks the
// editor — the copy handler under test is the one the editor installs on its own scroll element.

const OLD_TEXT = 'alpha\nbeta\ngamma\n'
const NEW_TEXT = 'alpha\nbeta changed\ngamma\n'

test('a selection over a deletion row copies the line with no diff marker', async () => {
  const { editor, rows } = await mountStackedDiff()
  const deletion = rowOffsets(rows, 'deletion')

  editor.setSelection(deletion.start, deletion.end)

  expect(copyPlainText()).toBe('beta')
})

test('a caret that selects nothing copies its whole line, terminator and all', async () => {
  const { editor, rows } = await mountStackedDiff()
  const deletion = rowOffsets(rows, 'deletion')

  // The old view returned nothing here and did not even `preventDefault`. A real editor treats a
  // collapsed caret as pointing at its line — including on a separator, where the line reads
  // `Show N unmodified lines`. Pinned rather than papered over: it is the sharpest visible change.
  editor.setSelection(deletion.start, deletion.start)

  expect(copyPlainText()).toBe('beta\n')
})

async function mountStackedDiff() {
  stubHighlightApi()
  const file = createTextDiff({
    newFile: { path: 'repo/a.ts', text: NEW_TEXT },
    oldFile: { path: 'repo/a.ts', text: OLD_TEXT },
  })
  let mounted: Editor | null = null
  render(
    // As the app mounts it: StrictMode's mount -> unmount -> mount is the development path, and
    // what survives only the first mount is what breaks there.
    <StrictMode>
      <DiffPane
        file={file}
        regions={createDiffRegionStore()}
        side='stacked'
        // No provider: a syntax pass would only colour rows this is not asking about.
        syntaxBackend={{ kind: 'tree-sitter', provider: null }}
        theme={{}}
        onRegisterEditor={(_side, editor) => {
          mounted = editor
        }}
      />
    </StrictMode>,
  )

  await waitFor(() => expect(mounted).not.toBeNull())

  return {
    editor: mounted as unknown as Editor,
    rows: createStackedProjection(file).rows,
  }
}

/** Where a row of this type starts and ends in the buffer the host pushed in. */
function rowOffsets(rows: readonly DiffRenderRow[], type: DiffRenderRow['type']) {
  let start = 0
  for (const row of rows) {
    if (row.type === type) return { end: start + row.text.length, start }

    start += row.text.length + 1
  }

  throw new Error(`no ${type} row in the projection`)
}

/** The editor installs its copy handler on the scroll element; this is the event it would see. */
function copyPlainText() {
  const values = new Map<string, string>()
  const event = new Event('copy', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    configurable: true,
    value: {
      getData: (format: string) => values.get(format) ?? '',
      setData: (format: string, value: string) => values.set(format, value),
    },
  })
  document.querySelector('.editor-diff-pane-stacked .editor-virtualized')!.dispatchEvent(event)

  return values.get('text/plain') ?? ''
}

function stubHighlightApi() {
  class HighlightStub extends Set<unknown> {}
  Object.assign(globalThis, { Highlight: HighlightStub })
  Object.assign(globalThis.CSS ?? {}, { highlights: new Map() })
}
