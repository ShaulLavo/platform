import { memo, type RefObject } from 'react'

import { SearchResultFileLineActionRow } from '@/features/search/search-result-file-line-action-row'
import { searchResultLineActionsStyle } from '@/features/search/search-result-editor-utils'
import type { SearchResultId } from '@/features/search/search-result-items'
import type {
  SearchResultFileDocument,
  SearchResultFileDocumentLine,
} from '@/features/search/search-result-view-model'

type SearchResultFileLineActionsProps = {
  canReplace?: boolean
  document: SearchResultFileDocument
  lineActionRowsRef: RefObject<Map<SearchResultId, HTMLDivElement>>
  replaceVisible: boolean
  onOpenLine: (line: SearchResultFileDocumentLine) => void
  onReplaceLine: (line: SearchResultFileDocumentLine) => void
}

export const SearchResultFileLineActions = memo(({
  canReplace,
  document,
  lineActionRowsRef,
  replaceVisible,
  onOpenLine,
  onReplaceLine,
}: SearchResultFileLineActionsProps) => {
  return (
    <div className='grid shrink-0' style={searchResultLineActionsStyle(document.lines.length)}>
      {document.lines.map((line) => (
        <SearchResultFileLineActionRow
          canReplace={canReplace}
          key={line.id}
          line={line}
          lineActionRowsRef={lineActionRowsRef}
          replaceVisible={replaceVisible}
          onOpenLine={onOpenLine}
          onReplaceLine={onReplaceLine}
        />
      ))}
    </div>
  )
})
