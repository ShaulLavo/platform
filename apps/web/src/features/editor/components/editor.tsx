import "@editor/core/style.css"
import "@editor/find/style.css"
import "@editor/minimap/style.css"
import { useEditor } from "@editor/react"
import "@editor/scope-lines/style.css"
import type {
  LanguageServerDefinitionTarget,
  LanguageServerReferencesResult,
} from "@editor/language-server"
import { useEffect, useLayoutEffect, useMemo, useState } from "react"

import { EditorFrame } from "@/features/editor/components/editor-frame"
import {
  createCriticalEditorCorePlugins,
  loadNonCriticalEditorPlugins,
} from "@/features/editor/editor-plugins"
import { selectionForDefinition } from "@/features/editor/utils/editor-position"
import { languageIdForFilePath } from "@/features/editor/utils/file-path"
import type { EditorStatusBarState } from "@/features/editor/components/editor-status-bar"
import type { CachedEditorDocument } from "@/features/editor/state/editor-document-state"
import { useCommitMessageEditorFocus } from "@/features/editor/hooks/use-commit-message-editor-focus"
import { useEditorColorTheme } from "@/features/editor/hooks/use-editor-color-theme"
import { useEditorStatusBarState } from "@/features/editor/hooks/use-editor-status-bar-state"
import {
  scrollPositionFromSnapshot,
  useScrollPersistencePlugin,
} from "@/features/editor/hooks/use-scroll-persistence-plugin"
import { useLanguageServerPlugin } from "@/features/editor/hooks/use-lsp-plugin"
import { useWorkspaceFocus } from "@/components/workspace/workspace-focus-state"
import type { DocumentSessionChange, EditorKeymapLayer } from "@editor/core"

type EditorProps = {
  active: boolean
  document: CachedEditorDocument
  keymapLayers: readonly EditorKeymapLayer[]
  rootPath: string
  tabId: string
  definitionTarget?: LanguageServerDefinitionTarget | null
  onDirtyChange?: (path: string, dirty: boolean) => void
  onOpenDefinition?: (target: LanguageServerDefinitionTarget) => void | boolean
  onOpenReferences?: (result: LanguageServerReferencesResult) => void | boolean
  onScrollPositionChange?: (
    path: string,
    scrollPosition: NonNullable<CachedEditorDocument["scrollPosition"]>
  ) => void
  onStatusChange?: (status: EditorStatusBarState) => void
  onTextChange?: (
    tabId: string,
    path: string,
    change: DocumentSessionChange
  ) => void
}

export function Editor({
  active,
  definitionTarget,
  document: cachedDocument,
  keymapLayers,
  rootPath,
  tabId,
  onDirtyChange,
  onOpenDefinition,
  onOpenReferences,
  onScrollPositionChange,
  onStatusChange,
  onTextChange,
}: EditorProps) {
  const editorActive = useWorkspaceFocus(
    (state) => state.activeArea === "editor" && active
  )
  const editorFocusRequestId = useWorkspaceFocus((state) =>
    state.consumeEditorFocusRequest()
  )
  const setActiveEditorCommandDispatch = useWorkspaceFocus(
    (state) => state.setActiveEditorCommandDispatch
  )
  const setFocusArea = useWorkspaceFocus((state) => state.setFocusArea)
  const { editorTheme } = useEditorColorTheme()
  const { languageServerDiagnostics, languageServer, languageServerStatus } =
    useLanguageServerPlugin({
      enabled: active,
      filePath: cachedDocument.path,
      rootPath,
      onOpenDefinition,
      onOpenReferences,
    })
  const scrollPersistencePlugin = useScrollPersistencePlugin({
    document: cachedDocument,
    onScrollPositionChange,
  })
  const [nonCriticalPlugins, setNonCriticalPlugins] = useState<
    readonly ReturnType<typeof createCriticalEditorCorePlugins>[number][]
  >([])
  const criticalEditorCorePlugins = useMemo(
    () => createCriticalEditorCorePlugins(),
    []
  )
  const plugins = useMemo(
    () => [
      ...criticalEditorCorePlugins,
      languageServer,
      ...nonCriticalPlugins,
      scrollPersistencePlugin,
    ],
    [
      criticalEditorCorePlugins,
      languageServer,
      nonCriticalPlugins,
      scrollPersistencePlugin,
    ]
  )
  const document = useMemo(
    () => ({
      documentId: cachedDocument.path,
      languageId: languageIdForFilePath(cachedDocument.path),
      revision: cachedDocument.contentRevision,
      scrollPosition: cachedDocument.scrollPosition,
      session: cachedDocument.session,
      text: "",
    }),
    [cachedDocument]
  )
  const controller = useEditor({
    cursorLineHighlight: {
      gutterNumber: true,
      gutterBackground: ["fold-gutter"],
      rowBackground: true,
    },
    document,
    keymap: {
      defaultBindings: false,
      layers: keymapLayers,
    },
    onChange: (_state, change) => {
      if (!change || change.kind === "selection" || change.kind === "none")
        return

      onTextChange?.(tabId, cachedDocument.path, change)
    },
    plugins,
    theme: editorTheme,
  })
  const editorInstance = controller.useEditorInstance()
  const editorState = controller.useState()
  const textSnapshot =
    controller.useTextSnapshot() ?? cachedDocument.session.getTextSnapshot()
  const selection = useMemo(
    () =>
      selectionForDefinition(
        cachedDocument.path,
        textSnapshot,
        definitionTarget
      ),
    [cachedDocument.path, definitionTarget, textSnapshot]
  )

  useEditorStatusBarState({
    charCount: editorState?.length ?? textSnapshot.length,
    filePath: cachedDocument.path,
    onChange: active ? onStatusChange : undefined,
    state: editorState,
    languageServerDiagnostics,
    languageServerStatus,
  })

  useEffect(() => {
    let active = true
    scheduleNonCriticalPluginLoad(async () => {
      const loaded = await loadNonCriticalEditorPlugins()
      if (active) setNonCriticalPlugins(loaded)
    })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!active) return

    onDirtyChange?.(
      cachedDocument.path,
      editorState?.isDirty ?? cachedDocument.session.isDirty()
    )
  }, [active, cachedDocument, editorState?.isDirty, onDirtyChange])

  useLayoutEffect(() => {
    return () => {
      const scrollPosition =
        controller.getEditor()?.getScrollPosition() ??
        scrollPositionFromSnapshot(controller.getSnapshot())
      if (!scrollPosition) return

      onScrollPositionChange?.(cachedDocument.path, scrollPosition)
    }
  }, [cachedDocument.path, controller, onScrollPositionChange])

  useEffect(() => {
    if (!selection) return
    controller.commands.setSelection(
      selection.anchor,
      selection.head,
      selection.anchor
    )
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
    document: cachedDocument,
    editorInstance,
  })

  return (
    <EditorFrame
      active={editorActive}
      controller={controller}
      onActivate={() => setFocusArea("editor")}
    />
  )
}

function scheduleNonCriticalPluginLoad(load: () => void) {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(load)
    return
  }

  queueMicrotask(load)
}
