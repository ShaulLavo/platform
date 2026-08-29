import { useEditor } from '@singapor/react'
import type {
  LanguageServerDefinitionTarget,
  LanguageServerReferencesResult,
} from '@singapor/lsp-plugin'
import { useEffect, useLayoutEffect, useMemo } from 'react'

import { EditorFrame } from '@/features/editor/components/frame'
import {
  createCriticalEditorCorePlugins,
  createNonCriticalEditorPluginsLoaderPlugin,
} from '@/features/editor/utils/plugins'
import { selectionForDefinition } from '@/features/editor/utils/position'
import { languageIdForFilePath } from '@/features/editor/utils/file-path'
import type { EditorStatusBarSource } from '@/features/editor/state/status-bar-source'
import type { EditorRenderDocument } from '@/features/editor/utils/render-document'
import { useCommitMessageEditorFocus } from '@/features/editor/hooks/use-commit-message-editor-focus'
import { useEditorColorTheme } from '@/features/editor/hooks/use-editor-color-theme'
import { useSettingValue } from '@/features/settings/hooks/use-setting-value'
import { useScrollPersistencePlugin } from '@/features/editor/hooks/use-scroll-persistence-plugin'
import {
  capOverscrollTop,
  scrollPositionFromSnapshot,
} from '@/features/editor/utils/scroll-position'
import { useLanguageServerPlugin } from '@/features/editor/hooks/use-lsp-plugin'
import type { LanguageServerDocumentTarget } from '@/features/editor/utils/language-server-plugin'
import { editorPerformanceLayoutVariant } from '@/features/editor/state/performance-trace'
import {
  fileBackedDocumentPath,
  savableDocumentPath,
} from '@/features/editor/utils/file-backed-document'
import { useFocusTarget } from '@/lib/focus/hooks/use-target'
import type {
  DocumentSessionChange,
  EditorInitialPaintEvent,
  EditorKeymapLayer,
  EditorKeymapOptions,
  EditorPlugin,
  EditorScrollPosition,
} from '@singapor/core'
import { editorPreparedDocumentTags } from '@/features/editor/utils/prepared-document'
import { useFileOpenIntent } from '@/lib/file-open-intent/providers/context'

const NO_ADDITIONAL_PLUGINS: readonly EditorPlugin[] = []

type EditorProps = {
  active: boolean
  document: EditorRenderDocument
  keymapLayers: readonly EditorKeymapLayer[]
  languageServerTarget?: LanguageServerDocumentTarget
  additionalPlugins?: readonly EditorPlugin[]
  rootPath: string
  tabId: string
  definitionTarget?: LanguageServerDefinitionTarget | null
  onOpenDefinition?: (target: LanguageServerDefinitionTarget) => void | boolean
  onOpenReferences?: (result: LanguageServerReferencesResult) => void | boolean
  onInitialPaint?: (event: EditorInitialPaintEvent) => void
  onScrollPositionChange?: (path: string, scrollPosition: EditorScrollPosition) => void
  onStatusSourceChange?: (source: EditorStatusBarSource) => void
  onTextChange?: (tabId: string, path: string, change: DocumentSessionChange) => void
}

export function Editor({
  active,
  additionalPlugins = NO_ADDITIONAL_PLUGINS,
  definitionTarget,
  document: liveDocument,
  keymapLayers,
  languageServerTarget,
  rootPath,
  tabId,
  onOpenDefinition,
  onOpenReferences,
  onInitialPaint,
  onScrollPositionChange,
  onStatusSourceChange,
  onTextChange,
}: EditorProps) {
  const { appliedThemeId, editorTheme, selectedThemeId } = useEditorColorTheme()
  const syntaxHighlightingEnabled = useSettingValue('editor.syntaxHighlighting.enabled')
  const { mountedEditors } = useFileOpenIntent()
  const { languageServer, languageServerStatusSource } = useLanguageServerPlugin({
    enabled: active,
    filePath: liveDocument.path,
    languageServerTarget,
    rootPath,
    onOpenDefinition,
    onOpenReferences,
  })
  const scrollPersistencePlugin = useScrollPersistencePlugin({
    document: liveDocument,
    onScrollPositionChange,
  })
  const documentLanguageId = languageIdForFilePath(liveDocument.path)
  // Stable tags keep an unrelated render from looking like a document reattachment.
  const preparedTags = useMemo(
    () =>
      editorPreparedDocumentTags(liveDocument.path, {
        appliedThemeId,
        selectedThemeId,
        syntaxHighlightingEnabled,
      }),
    [appliedThemeId, liveDocument.path, selectedThemeId, syntaxHighlightingEnabled],
  )
  const criticalEditorCorePlugins = useMemo(
    () => createCriticalEditorCorePlugins(documentLanguageId),
    [documentLanguageId],
  )
  const nonCriticalEditorPlugins = useMemo(
    () => createNonCriticalEditorPluginsLoaderPlugin(documentLanguageId),
    [documentLanguageId],
  )
  const plugins = useMemo(
    () => [
      ...criticalEditorCorePlugins,
      languageServer,
      nonCriticalEditorPlugins,
      scrollPersistencePlugin,
      ...additionalPlugins,
    ],
    [
      additionalPlugins,
      criticalEditorCorePlugins,
      languageServer,
      nonCriticalEditorPlugins,
      scrollPersistencePlugin,
    ],
  )
  const document = useMemo(
    () => ({
      documentId: liveDocument.id,
      buffer: liveDocument.buffer,
      ...preparedTags,
      languageId: documentLanguageId,
      preparedDocument: liveDocument.preparedDocument,
      text: '',
      view: liveDocument.view,
    }),
    [
      documentLanguageId,
      liveDocument.buffer,
      liveDocument.id,
      liveDocument.preparedDocument,
      liveDocument.view,
      preparedTags,
    ],
  )
  const editorKeymap = useMemo(
    () =>
      ({
        defaultBindings: false,
        layers: keymapLayers,
      }) satisfies EditorKeymapOptions,
    [keymapLayers],
  )
  const rowPositioning = editorPerformanceLayoutVariant() === 'absolute-rows' ? 'top' : 'transform'
  const controller = useEditor({
    cursorLineHighlight: {
      gutterNumber: true,
      gutterBackground: ['fold-gutter'],
      rowBackground: true,
    },
    document,
    editability: liveDocument.editability,
    keymap: editorKeymap,
    onChange: (_state, change) => {
      if (!change || change.kind === 'selection' || change.kind === 'none') return

      onTextChange?.(tabId, liveDocument.path, change)
    },
    onInitialPaint,
    plugins,
    rowPositioning,
    theme: editorTheme,
  })
  useLayoutEffect(
    () => mountedEditors.register(liveDocument.path),
    [liveDocument.path, mountedEditors],
  )
  const settingsSurface =
    savableDocumentPath(liveDocument.path) !== null &&
    fileBackedDocumentPath(liveDocument.path) === null
  const focusTarget = useFocusTarget<HTMLDivElement>({
    area: 'editor',
    capabilities: {
      editor: {
        dispatch: controller.commands.dispatchCommand,
        writable: liveDocument.editability === 'editable',
      },
    },
    id: {
      key: liveDocument.id,
      kind: 'editor',
      surface: settingsSurface ? 'settings' : 'document',
      tabId,
    },
    onIntent: (intent) => {
      if (intent !== 'focus') return false

      controller.commands.focus()
      return true
    },
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
      const snapshot = controller.getSnapshot()
      const scrollPosition =
        controller.getEditor()?.getScrollPosition() ?? scrollPositionFromSnapshot(snapshot)
      if (!scrollPosition) return

      onScrollPositionChange?.(liveDocument.path, {
        left: scrollPosition.left,
        top:
          scrollPosition.top === undefined
            ? undefined
            : capOverscrollTop(scrollPosition.top, snapshot),
      })
    }
  }, [controller, liveDocument.path, onScrollPositionChange])

  useEffect(() => {
    if (!selection) return
    controller.commands.setSelection(selection.anchor, selection.head, selection.anchor)
  }, [controller, selection])

  useCommitMessageEditorFocus({
    controller,
    document: liveDocument,
  })

  return (
    <EditorFrame
      active={active && focusTarget.focused}
      controller={controller}
      targetRef={active ? focusTarget.ref : undefined}
    />
  )
}
