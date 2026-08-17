import type { HighlightResult } from '@streamdown/code'
import { use, useEffect, useState } from 'react'

import { MarkdownCodeHighlighterContext } from '@/features/chat/providers/markdown-code-highlighter-context'
import {
  estimateHighlightBytes,
  markdownHighlightCacheKey,
} from '@/features/chat/utils/markdown-highlight'
import { markdownHighlightCache } from '@/features/chat/state/markdown-highlight-cache'

type HighlightState = {
  readonly key: string
  readonly result: HighlightResult
}

/**
 * `cacheable` is false while a fence is still streaming: those token arrays are
 * superseded by the next chunk, so caching them would fill the budget with
 * garbage and evict the finished blocks the user scrolls back to.
 */
export function useHighlightedCode({
  cacheable,
  code,
  language,
}: {
  readonly cacheable: boolean
  readonly code: string
  readonly language: string
}): HighlightResult | null {
  const highlighter = use(MarkdownCodeHighlighterContext)
  const [highlighted, setHighlighted] = useState<HighlightState | null>(null)
  const key = highlighter
    ? markdownHighlightCacheKey({ code, language, themeKey: highlighter.themeKey })
    : ''
  const cached = cacheable && code.length > 0 ? markdownHighlightCache.get(key) : null

  useEffect(() => {
    if (!highlighter) return
    if (code.length === 0) return
    if (cacheable && markdownHighlightCache.get(key)) return

    let active = true
    const accept = (result: HighlightResult) => {
      if (cacheable) markdownHighlightCache.set(key, result, estimateHighlightBytes(result))
      if (!active) return

      setHighlighted({ key, result })
    }

    // A loaded grammar answers synchronously and never calls back; an unloaded
    // one returns null now and calls back once shiki has it.
    const immediate = highlighter.highlight({ code, language }, accept)
    if (immediate) accept(immediate)

    return () => {
      active = false
    }
  }, [cacheable, code, highlighter, key, language])

  if (cached) return cached
  if (highlighted?.key === key) return highlighted.result

  return null
}
