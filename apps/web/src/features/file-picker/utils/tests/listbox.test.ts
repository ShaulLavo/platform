import { expect, test } from '../../../../../test/fixtures'

import {
  buildFileListRowMetrics,
  fileListOptionId,
  fileListSelectionScrollTop,
  nearestFileListScrollTop,
  visibleFileListRows,
} from '@/features/file-picker/utils/listbox'

test('finds a bounded virtual range and pins an offscreen selection', () => {
  const metrics = buildFileListRowMetrics(
    Array.from({ length: 1_000 }, (_, index) => ({ key: String(index), size: 44 })),
  )
  const viewport = { height: 440, top: 22_000 }

  const visible = visibleFileListRows(metrics, viewport)
  const withPinnedSelection = visibleFileListRows(metrics, viewport, 900)

  expect(visible[0]?.index).toBe(488)
  expect(visible.at(-1)?.index).toBe(521)
  expect(visible).toHaveLength(34)
  expect(withPinnedSelection.at(-1)?.index).toBe(900)
})

test('calculates the nearest scroll position without moving visible rows', () => {
  const metrics = buildFileListRowMetrics([
    { key: 'first', size: 44 },
    { key: 'second', size: 44 },
    { key: 'third', size: 44 },
  ])
  const viewport = { height: 60, top: 44 }

  expect(nearestFileListScrollTop(metrics.items[1]!, viewport)).toBe(44)
  expect(nearestFileListScrollTop(metrics.items[0]!, viewport)).toBe(0)
  expect(nearestFileListScrollTop(metrics.items[2]!, viewport)).toBe(72)
})

test('resets the scroll position when selection clears', () => {
  expect(fileListSelectionScrollTop(undefined, { height: 440, top: 22_000 })).toBe(0)
})

test('encodes paths into deterministic option ids', () => {
  expect(fileListOptionId(':picker:', 'src/components/my file.tsx')).toBe(
    '3a-70-69-63-6b-65-72-3a-option-73-72-63-2f-63-6f-6d-70-6f-6e-65-6e-74-73-2f-6d-79-20-66-69-6c-65-2e-74-73-78',
  )
  expect(fileListOptionId(':picker:', '')).toBe('3a-70-69-63-6b-65-72-3a-option-root')
})

test('keeps encoded option ids distinct from escape-like file names', () => {
  expect(fileListOptionId(':picker:', 'p/a/b')).not.toBe(fileListOptionId(':picker:', 'p/a_2Fb'))
})
