import type { EditorKeymapLayer } from '@editor/core'

import { SearchBufferEditorControls } from '@/features/search/search-buffer-editor-controls'
import { SearchBufferEditorResults } from '@/features/search/search-buffer-editor-results'

export function SearchBufferEditor({
  editorKeymapLayers,
  rootPath,
}: {
  editorKeymapLayers: readonly EditorKeymapLayer[]
  rootPath: string
}) {
  return (
    <section className='bg-background grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]'>
      <SearchBufferEditorControls rootPath={rootPath} />
      <SearchBufferEditorResults editorKeymapLayers={editorKeymapLayers} rootPath={rootPath} />
    </section>
  )
}
