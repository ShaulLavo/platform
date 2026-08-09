import type { HighlightResult } from '@streamdown/code'
import { createContext } from 'react'

export type MarkdownCodeHighlighter = {
  /** Returns tokens synchronously when the grammar is loaded, otherwise calls back. */
  readonly highlight: (
    input: { readonly code: string; readonly language: string },
    onResult: (result: HighlightResult) => void,
  ) => HighlightResult | null
  /** Identity of the active editor theme; part of every highlight cache key. */
  readonly themeKey: string
}

export const MarkdownCodeHighlighterContext = createContext<MarkdownCodeHighlighter | null>(null)
