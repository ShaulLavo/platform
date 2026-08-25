import {
  captureTerminalSelection,
  type TerminalSelectionSource,
} from '@/features/terminal/utils/capture'
import { expect, test } from '../../../../../test/fixtures'

test('a selection is captured with the terminal it came from', () => {
  const capture = captureTerminalSelection(
    terminal({ selection: 'npm ERR! errno 1\nnpm ERR! build failed', startRow: 811 }),
    'terminal-1',
  )

  expect(capture).toEqual({
    lineEnd: 813,
    lineStart: 812,
    source: 'terminal-1',
    text: 'npm ERR! errno 1\nnpm ERR! build failed',
  })
})

test('the line span comes from the captured text, not from the trailing cell', () => {
  // ghostty's range end is the cell after the selection, so a drag released at
  // the start of the next row must not claim a line it contributed nothing to.
  const capture = captureTerminalSelection(
    terminal({ selection: 'one line\n', startRow: 4 }),
    'terminal-1',
  )

  expect(capture?.lineStart).toBe(5)
  expect(capture?.lineEnd).toBe(5)
})

test('nothing selected captures nothing', () => {
  expect(captureTerminalSelection(terminal({ selection: '' }), 'terminal-1')).toBeNull()
  expect(captureTerminalSelection(terminal({ selection: '  \n\n' }), 'terminal-1')).toBeNull()
})

test('a selection with no reported position starts at the first line', () => {
  const capture = captureTerminalSelection(
    { getSelection: () => 'orphaned output', selectionCoordinates: () => undefined },
    'terminal-1',
  )

  expect(capture?.lineStart).toBe(1)
})

function terminal({
  selection,
  startRow = 0,
}: {
  selection: string
  startRow?: number
}): TerminalSelectionSource {
  return {
    getSelection: () => selection,
    selectionCoordinates: () => ({ start: { y: startRow } }),
  }
}
