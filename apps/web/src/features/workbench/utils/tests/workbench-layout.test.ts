import {
  createDefaultWorkbenchLayout,
  normalizeWorkbenchLayout,
  setWorkbenchMainLayout,
  setWorkbenchOuterLayout,
} from '@/features/workbench/utils/workbench-layout'
import { expect, test } from '../../../../../test/fixtures'

test('normalizes out-of-range pane dimensions back to the defaults', () => {
  const result = normalizeWorkbenchLayout({
    mainLayout: { bottom: 999, editor: 0 },
    outerLayout: { main: 0, sidebar: 999 },
  })

  expect(result.mainLayout).toEqual({ bottom: 30, editor: 70 })
  expect(result.outerLayout).toEqual({ main: 76, sidebar: 24 })
})

test('rescales a split so the two sides always total 100', () => {
  const layout = setWorkbenchOuterLayout(createDefaultWorkbenchLayout(), { main: 68, sidebar: 32 })

  expect(layout.outerLayout.sidebar + layout.outerLayout.main).toBe(100)
  expect(layout.outerLayout.sidebar).toBeCloseTo(32)
})

test('returns the same layout when a split does not move', () => {
  const layout = createDefaultWorkbenchLayout()

  expect(setWorkbenchOuterLayout(layout, layout.outerLayout)).toBe(layout)
  expect(setWorkbenchMainLayout(layout, layout.mainLayout)).toBe(layout)
})
