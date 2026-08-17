import { memo } from 'react'
import type { EditorKeymapLayer } from '@singapor/core'

import { SearchControls } from '@/features/workspace/components/search-controls'
import { SearchResults } from '@/features/workspace/components/search-results'

export const SearchPane = memo(
  ({
    compact = true,
    editorKeymapLayers,
    rootPath,
  }: {
    readonly compact?: boolean
    readonly editorKeymapLayers: readonly EditorKeymapLayer[]
    readonly rootPath: string
  }) => {
    return (
      <section className='grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden'>
        <SearchControls rootPath={rootPath} showOpenInEditorButton={compact} />
        <SearchResults
          compact={compact}
          editorKeymapLayers={editorKeymapLayers}
          rootPath={rootPath}
        />
      </section>
    )
  },
)
