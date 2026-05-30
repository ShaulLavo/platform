import type { BrowserTextMetrics, EditorKeymapOptions } from '@editor/core'
import type { CSSProperties } from 'react'

import type { SearchResultVirtualListViewport } from '@/features/search/search-result-virtual-list'

export const FILE_ROW_ESTIMATE = 44
export const EXCERPT_EDITOR_LINE_HEIGHT = 22
export const EXCERPT_EDITOR_CHARACTER_WIDTH = 8
export const SEARCH_RESULT_FILE_EDITOR_ROW_GAP = 6
export const SEARCH_RESULT_VIRTUAL_FALLBACK_COUNT = 8
export const SEARCH_RESULT_VIRTUAL_BASE_MIN_OVERSCAN = 640
export const SEARCH_RESULT_VIRTUAL_BASE_OVERSCAN_RATIO = 1
export const SEARCH_RESULT_VIRTUAL_FAST_MIN_OVERSCAN = 1_400
export const SEARCH_RESULT_VIRTUAL_FAST_OVERSCAN_RATIO = 1.75
export const SEARCH_RESULT_VIRTUAL_FLING_MIN_OVERSCAN = 2_600
export const SEARCH_RESULT_VIRTUAL_FLING_OVERSCAN_RATIO = 3
export const SEARCH_RESULT_VIRTUAL_FAST_SCROLL_PX_PER_MS = 1.2
export const SEARCH_RESULT_VIRTUAL_FLING_SCROLL_PX_PER_MS = 4
export const SEARCH_RESULT_VIRTUAL_OVERSCAN_IDLE_DELAY_MS = 180
export const SEARCH_RESULT_VIRTUAL_PADDING = 12
export const SEARCH_RESULT_VIRTUAL_ROW_OFFSET = 6
export const INITIAL_SEARCH_RESULT_VIRTUAL_VIEWPORT = {
  height: 0,
  top: 0,
} satisfies SearchResultVirtualListViewport
export const FILE_RESULTS_EDITOR_MIN_HEIGHT = 28
export const FILE_RESULTS_ROW_VERTICAL_PADDING = 8

export const SEARCH_RESULT_FILE_EDITOR_POOL_HIDDEN_STYLE = {
  contain: 'layout paint style',
  display: 'none',
  pointerEvents: 'none',
} satisfies CSSProperties

export const SEARCH_RESULT_CURSOR_LINE_HIGHLIGHT = {
  gutterBackground: false,
  gutterNumber: false,
  rowBackground: false,
} as const
export const SEARCH_RESULT_FILE_EDITOR_TEXT_METRICS = {
  characterWidth: EXCERPT_EDITOR_CHARACTER_WIDTH,
  rowHeight: EXCERPT_EDITOR_LINE_HEIGHT,
} satisfies BrowserTextMetrics
export const SEARCH_RESULT_INACTIVE_EDITOR_KEYMAP = {
  enabled: false,
} satisfies EditorKeymapOptions
