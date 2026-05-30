import { memo } from 'react'

import { searchResultSourceLineGutterStyle } from '@/features/search/search-result-editor-utils'
import type { SearchResultFileDocument } from '@/features/search/search-result-view-model'

type SearchResultSourceLineGutterProps = {
  document: SearchResultFileDocument
  minDigits: number
}

export const SearchResultSourceLineGutter = memo(({
  document,
  minDigits,
}: SearchResultSourceLineGutterProps) => {
  return (
    <div
      aria-hidden='true'
      className='text-muted-foreground box-border grid shrink-0 overflow-hidden pr-2 text-right font-mono text-[13px] select-none'
      style={searchResultSourceLineGutterStyle(document.lines.length, minDigits)}
    >
      {document.lines.map((line) => (
        <span className='block overflow-hidden leading-[22px] tabular-nums' key={line.id}>
          {line.sourceLine}
        </span>
      ))}
    </div>
  )
})
