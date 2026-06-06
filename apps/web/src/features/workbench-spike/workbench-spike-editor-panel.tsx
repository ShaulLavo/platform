import '@editor/core/style.css'
import '@editor/find/style.css'
import { useEditor } from '@editor/react'
import type { EditorKeymapLayer } from '@editor/core'
import '@editor/scope-lines/style.css'
import { EditorHost } from '@editor/react'
import { useContext, useEffect, useEffectEvent } from 'react'

import { WorkbenchSpikeMetricsContext } from '@/features/workbench-spike/workbench-spike-metrics-context'
import { workbenchSpikeEditorSession } from '@/features/workbench-spike/workbench-spike-editor-sessions'
import type { WorkbenchSpikePanel } from '@/features/workbench-spike/workbench-spike-types'
import { createCriticalEditorCorePlugins } from '@/features/editor/editor-plugins'
import { useEditorColorTheme } from '@/features/editor/hooks/use-editor-color-theme'

const EMPTY_KEYMAP_LAYERS: readonly EditorKeymapLayer[] = []

export function WorkbenchSpikeEditorPanel({ panel }: { panel: WorkbenchSpikePanel }) {
  const { onEditorPanelMounted } = useContext(WorkbenchSpikeMetricsContext)
  const session = workbenchSpikeEditorSession(panel)
  const { editorTheme } = useEditorColorTheme()
  const notifyEditorPanelMounted = useEffectEvent(onEditorPanelMounted)
  const plugins = createCriticalEditorCorePlugins()
  const document = {
    buffer: session.buffer,
    documentId: session.documentId,
    languageId: 'typescript',
    text: '',
    view: session.view,
  }
  const controller = useEditor({
    cursorLineHighlight: {
      gutterBackground: ['fold-gutter'],
      gutterNumber: true,
      rowBackground: true,
    },
    document,
    keymap: {
      defaultBindings: false,
      layers: EMPTY_KEYMAP_LAYERS,
    },
    plugins,
    theme: editorTheme,
  })

  useEffect(() => {
    notifyEditorPanelMounted(panel.id)
  }, [panel.id])

  return (
    <section className='workbench-spike-panel workbench-spike-editor-panel'>
      <EditorHost className='app-editor-host' controller={controller} />
    </section>
  )
}
