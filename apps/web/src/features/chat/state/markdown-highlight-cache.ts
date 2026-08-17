import type { HighlightResult } from '@streamdown/code'

import { ByteBoundedLru } from '@/features/chat/utils/byte-bounded-lru'

/**
 * App-level because the same code block is highlighted again every time the
 * timeline scrolls it back into view, and identical snippets repeat across
 * turns. Bounded in bytes first: a diff-heavy block is worth thousands of
 * one-line snippets.
 */
const MAX_HIGHLIGHT_ENTRIES = 300
const MAX_HIGHLIGHT_BYTES = 24 * 1024 * 1024

export const markdownHighlightCache = new ByteBoundedLru<HighlightResult>(
  MAX_HIGHLIGHT_ENTRIES,
  MAX_HIGHLIGHT_BYTES,
)
