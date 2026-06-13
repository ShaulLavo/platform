import { SearchPane } from '@/components/workspace/search/components/search-pane'

import { PanelUnavailable } from '@/features/workbench/components/panel-unavailable'
import { useEditorSurfaceContext } from '@/features/workbench/hooks/use-editor-surface-context'
import type { SurfaceRendererProps } from '@/features/workbench/utils/surface-renderer-registry'

export function SearchResultsDetailSurface({ surface }: SurfaceRendererProps) {
  const { editorKeymapLayers, rootPath } = useEditorSurfaceContext()
  if (surface.type !== 'search-results-detail') {
    return <PanelUnavailable message='This surface is not search results.' />
  }

  return (
    <SearchPane
      compact={false}
      editorKeymapLayers={editorKeymapLayers}
      ownerSurfaceId={surface.id}
      rootPath={rootPath}
    />
  )
}
