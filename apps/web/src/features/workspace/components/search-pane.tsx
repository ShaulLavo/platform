import { memo, useCallback, useRef } from 'react'
import type { EditorKeymapLayer } from '@singapor/core'

import { SearchControls } from '@/features/workspace/components/search-controls'
import { SearchResults } from '@/features/workspace/components/search-results'
import { useFocusTarget } from '@/lib/focus/hooks/use-target'

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
    const rootRef = useRef<HTMLElement | null>(null)
    const { ref: focusTargetRef } = useFocusTarget<HTMLElement>({
      area: 'search',
      id: { kind: 'search', rootPath, surface: compact ? 'sidebar' : 'editor' },
      onIntent: (intent) => {
        if (intent !== 'focus') return false

        const input = rootRef.current?.querySelector<HTMLInputElement>(
          'input[aria-label="Search workspace"]',
        )
        if (!input) return false

        input.focus()
        return true
      },
    })
    // Stable identity keeps the parent target mounted while nested editors register deeper.
    const setRootRef = useCallback(
      (element: HTMLElement | null) => {
        rootRef.current = element
        focusTargetRef(element)
      },
      [focusTargetRef],
    )

    return (
      <section
        className='grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden'
        ref={setRootRef}
      >
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
