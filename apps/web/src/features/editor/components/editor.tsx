import '@editor/core/style.css'
import '@editor/find/style.css'
import '@editor/minimap/style.css'
import { useEditor } from '@editor/react'
import '@editor/scope-lines/style.css'
import type {
  LanguageServerDefinitionTarget,
  LanguageServerReferencesResult,
} from '@editor/lsp-plugin'
import { useCallback, useEffect, useLayoutEffect, useMemo } from 'react'

import { EditorFrame } from '@/features/editor/components/editor-frame'
import {
  createCriticalEditorCorePlugins,
  createNonCriticalEditorPluginsLoaderPlugin,
} from '@/features/editor/editor-plugins'
import { selectionForDefinition } from '@/features/editor/utils/editor-position'
import { languageIdForFilePath } from '@/features/editor/utils/file-path'
import type { EditorStatusBarSource } from '@/features/editor/state/editor-status-bar-source'
import type { EditorRenderDocument } from '@/features/editor/editor-render-document'
import { useCommitMessageEditorFocus } from '@/features/editor/hooks/use-commit-message-editor-focus'
import { useEditorColorTheme } from '@/features/editor/hooks/use-editor-color-theme'
import {
  scrollPositionFromSnapshot,
  useScrollPersistencePlugin,
} from '@/features/editor/hooks/use-scroll-persistence-plugin'
import { useLanguageServerPlugin } from '@/features/editor/hooks/use-lsp-plugin'
import { useWorkspaceFocus } from '@/components/workspace/workspace-focus-state'
import type {
  DocumentSessionChange,
  EditorKeymapLayer,
  EditorKeymapOptions,
  EditorScrollPosition,
} from '@editor/core'

type EditorProps = {
  active: boolean
  document: EditorRenderDocument
  keymapLayers: readonly EditorKeymapLayer[]
  rootPath: string
  tabId: string
  definitionTarget?: LanguageServerDefinitionTarget | null
  onDirtyChange?: (path: string, dirty: boolean) => void
  onOpenDefinition?: (target: LanguageServerDefinitionTarget) => void | boolean
  onOpenReferences?: (result: LanguageServerReferencesResult) => void | boolean
  onScrollPositionChange?: (path: string, scrollPosition: EditorScrollPosition) => void
  onStatusSourceChange?: (source: EditorStatusBarSource) => void
  onTextChange?: (tabId: string, path: string, change: DocumentSessionChange) => void
}

export function Editor({
  active,
  definitionTarget,
  document: liveDocument,
  keymapLayers,
  rootPath,
  tabId,
  onDirtyChange,
  onOpenDefinition,
  onOpenReferences,
  onScrollPositionChange,
  onStatusSourceChange,
  onTextChange,
}: EditorProps) {
  const editorActive = useWorkspaceFocus((state) => state.activeArea === 'editor' && active)
  const editorFocusRequestId = useWorkspaceFocus((state) => state.consumeEditorFocusRequest())
  const setActiveEditorCommandDispatch = useWorkspaceFocus(
    (state) => state.setActiveEditorCommandDispatch,
  )
  const setFocusArea = useWorkspaceFocus((state) => state.setFocusArea)
  const { editorTheme } = useEditorColorTheme()
  const { languageServer, languageServerStatusSource } = useLanguageServerPlugin({
    enabled: active,
    filePath: liveDocument.path,
    rootPath,
    onOpenDefinition,
    onOpenReferences,
  })
  const scrollPersistencePlugin = useScrollPersistencePlugin({
    document: liveDocument,
    onScrollPositionChange,
  })
  const criticalEditorCorePlugins = useMemo(() => createCriticalEditorCorePlugins(), [])
  const nonCriticalEditorPlugins = useMemo(() => createNonCriticalEditorPluginsLoaderPlugin(), [])
  const plugins = useMemo(
    () => [
      ...criticalEditorCorePlugins,
      languageServer,
      nonCriticalEditorPlugins,
      scrollPersistencePlugin,
    ],
    [criticalEditorCorePlugins, languageServer, nonCriticalEditorPlugins, scrollPersistencePlugin],
  )
  const document = useMemo(
    () => ({
      documentId: liveDocument.id,
      buffer: liveDocument.buffer,
      languageId: languageIdForFilePath(liveDocument.path),
      text: '',
      view: liveDocument.view,
    }),
    [liveDocument.buffer, liveDocument.id, liveDocument.path, liveDocument.view],
  )
  const editorKeymap = useMemo(
    () =>
      ({
        defaultBindings: false,
        layers: keymapLayers,
      }) satisfies EditorKeymapOptions,
    [keymapLayers],
  )
  const controller = useEditor({
    cursorLineHighlight: {
      gutterNumber: true,
      gutterBackground: ['fold-gutter'],
      rowBackground: true,
    },
    document,
    keymap: editorKeymap,
    onChange: (state, change) => {
      if (!change || change.kind === 'selection' || change.kind === 'none') return

      onTextChange?.(tabId, liveDocument.path, change)
      onDirtyChange?.(liveDocument.path, state.isDirty)
    },
    plugins,
    theme: editorTheme,
  })
  const selection = useMemo(
    () =>
      definitionTarget
        ? selectionForDefinition(
            liveDocument.path,
            liveDocument.buffer.getTextSnapshot(),
            definitionTarget,
          )
        : null,
    [definitionTarget, liveDocument.buffer, liveDocument.path],
  )

  useEffect(() => {
    if (!active) return

    onStatusSourceChange?.({
      controller,
      filePath: liveDocument.path,
      languageServerStatusSource,
    })
  }, [active, controller, languageServerStatusSource, liveDocument.path, onStatusSourceChange])

  useLayoutEffect(() => {
    return () => {
      const scrollPosition =
        controller.getEditor()?.getScrollPosition() ??
        scrollPositionFromSnapshot(controller.getSnapshot())
      if (!scrollPosition) return

      onScrollPositionChange?.(liveDocument.path, scrollPosition)
    }
  }, [controller, liveDocument.path, onScrollPositionChange])

  useEffect(() => {
    if (!selection) return
    controller.commands.setSelection(selection.anchor, selection.head, selection.anchor)
  }, [controller, selection])

  useEffect(() => {
    if (!active) return
    if (editorFocusRequestId === 0) return

    controller.commands.focus()
  }, [active, controller, editorFocusRequestId])

  useEffect(() => {
    if (!active) return

    setActiveEditorCommandDispatch(controller.commands.dispatchCommand)

    return () => setActiveEditorCommandDispatch(null)
  }, [active, controller, setActiveEditorCommandDispatch])

  useCommitMessageEditorFocus({
    controller,
    document: liveDocument,
  })

  const handleActivate = useCallback(
    function handleActivate() {
      setFocusArea('editor')
    },
    [setFocusArea],
  )

  return <EditorFrame active={editorActive} controller={controller} onActivate={handleActivate} />
}
