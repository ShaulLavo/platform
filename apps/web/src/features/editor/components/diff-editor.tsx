import { createDiffRegionStore, type DiffFile, type DiffRegionStore } from '@singapor/diff'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@workspace/ui/components/resizable'
import { useMemo, useState } from 'react'

import { DiffPane } from '@/features/editor/components/diff-pane'
import { useDiffPanes } from '@/features/editor/hooks/use-diff-panes'
import { useEditorColorTheme } from '@/features/editor/hooks/use-editor-color-theme'
import type { EditorDiffViewMode } from '@/features/editor/utils/diff-view-mode'
import { editorTreeSitterSyntaxProvider } from '@/features/editor/utils/plugins'

/**
 * A diff, drawn as one or two real `Editor`s with the diff plugin supplying the rows.
 *
 * `editor-diff-view` on the root is not decoration: it is where both the package's own
 * `--editor-diff-*` block and the app's override of it are declared, and a context row carries no
 * row class of its own, so inheritance from here is the only way the variables reach it.
 */
export function DiffEditor({
  file,
  mode,
  regions,
}: {
  file: DiffFile
  mode: EditorDiffViewMode
  regions?: DiffRegionStore
}) {
  const { editorTheme } = useEditorColorTheme()
  // Memoized for identity, not for cost: this is a dependency of the plugin each pane builds, so a
  // fresh object per render would tear down and rebuild both plugins on every render.
  const syntaxBackend = useMemo(
    () => ({ kind: 'tree-sitter' as const, provider: editorTreeSitterSyntaxProvider() }),
    [],
  )
  // Split is two plugin instances, and a separator row is one region shown twice. Without a shared
  // store a gutter click would expand one pane and leave the other where it was, misaligning every
  // row below — the one property split mode exists to hold.
  const [privateRegions] = useState(createDiffRegionStore)
  const regionStore = regions ?? privateRegions
  const panes = useDiffPanes()

  if (mode === 'stacked') {
    return (
      <div className='editor-diff-view flex h-full min-h-0 w-full min-w-0 overflow-hidden'>
        <DiffPane
          file={file}
          regions={regionStore}
          side='stacked'
          syntaxBackend={syntaxBackend}
          theme={editorTheme}
        />
      </div>
    )
  }

  return (
    <div className='editor-diff-view flex h-full min-h-0 w-full min-w-0 overflow-hidden'>
      <ResizablePanelGroup className='min-h-0 min-w-0' id='diff-panes'>
        <ResizablePanel className='min-h-0 min-w-0 overflow-hidden' id='diff-old'>
          <DiffPane
            file={file}
            regions={regionStore}
            side='old'
            syntaxBackend={syntaxBackend}
            theme={editorTheme}
            onFocus={panes.handleFocus}
            onRegisterEditor={panes.registerEditor}
            onScroll={panes.handleScroll}
          />
        </ResizablePanel>
        <ResizableHandle id='diff-panes-handle' withHandle />
        <ResizablePanel className='min-h-0 min-w-0 overflow-hidden' id='diff-new'>
          <DiffPane
            file={file}
            regions={regionStore}
            side='new'
            syntaxBackend={syntaxBackend}
            theme={editorTheme}
            onFocus={panes.handleFocus}
            onRegisterEditor={panes.registerEditor}
            onScroll={panes.handleScroll}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
