import "@editor/core/style.css"
import "@editor/find/style.css"
import "@editor/minimap/style.css"
import { useEditor } from "@editor/react"
import "@editor/scope-lines/style.css"
import type { TypeScriptLspDefinitionTarget } from "@editor/typescript-lsp"
import { useEffect, useLayoutEffect, useMemo } from "react"

import { EditorFrame } from "@/features/editor/components/editor-frame"
import { createEditorPlugins } from "@/features/editor/editor-plugins"
import { selectionForDefinition } from "@/features/editor/utils/editor-position"
import { languageIdForFilePath } from "@/features/editor/utils/file-path"
import type { EditorStatusBarState } from "@/features/editor/components/editor-status-bar"
import type { CachedEditorDocument } from "@/features/editor/state/editor-document-state"
import { useCommitMessageEditorFocus } from "@/features/editor/hooks/use-commit-message-editor-focus"
import { useEditorShikiTheme } from "@/features/editor/hooks/use-editor-shiki-theme"
import { useEditorStatusBarState } from "@/features/editor/hooks/use-editor-status-bar-state"
import {
  scrollPositionFromSnapshot,
  useScrollPersistencePlugin,
} from "@/features/editor/hooks/use-scroll-persistence-plugin"
import { useTypeScriptLspPlugin } from "@/features/editor/hooks/use-typescript-lsp-plugin"
import { useWorkspaceFocus } from "@/components/workspace/workspace-focus-state"

type EditorProps = {
  document: CachedEditorDocument
  rootPath: string
  definitionTarget?: TypeScriptLspDefinitionTarget | null
  onDirtyChange?: (path: string, dirty: boolean) => void
  onOpenDefinition?: (target: TypeScriptLspDefinitionTarget) => void | boolean
  onScrollPositionChange?: (
    path: string,
    scrollPosition: NonNullable<CachedEditorDocument["scrollPosition"]>
  ) => void
  onStatusChange?: (status: EditorStatusBarState) => void
}

export function Editor({
  definitionTarget,
  document: cachedDocument,
  rootPath,
  onDirtyChange,
  onOpenDefinition,
  onScrollPositionChange,
  onStatusChange,
}: EditorProps) {
  const editorActive = useWorkspaceFocus(
    (state) => state.activeArea === "editor"
  )
  const editorFocusRequestId = useWorkspaceFocus((state) =>
    state.consumeEditorFocusRequest()
  )
  const setFocusArea = useWorkspaceFocus((state) => state.setFocusArea)
  const { editorThemeRefresh, shikiThemeResolver } = useEditorShikiTheme()
  const { typeScriptDiagnostics, typeScriptLsp, typeScriptStatus } =
    useTypeScriptLspPlugin({ rootPath, onOpenDefinition })
  const scrollPersistencePlugin = useScrollPersistencePlugin({
    document: cachedDocument,
    onScrollPositionChange,
  })
  const plugins = useMemo(
    () => [
      ...createEditorPlugins(typeScriptLsp, shikiThemeResolver),
      scrollPersistencePlugin,
    ],
    [scrollPersistencePlugin, shikiThemeResolver, typeScriptLsp]
  )
  const document = useMemo(
    () => ({
      documentId: cachedDocument.path,
      languageId: languageIdForFilePath(cachedDocument.path),
      revision: cachedDocument.revision,
      scrollPosition: cachedDocument.scrollPosition,
      session: cachedDocument.session,
      text: cachedDocument.session.getText(),
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
    plugins,
    theme: editorThemeRefresh,
  })
  const editorInstance = controller.useEditorInstance()
  const editorState = controller.useState()
  const selection = selectionForDefinition(
    cachedDocument.path,
    document.text,
    definitionTarget
  )

  useEditorStatusBarState({
    charCount: editorState?.length ?? document.text.length,
    filePath: cachedDocument.path,
    onChange: onStatusChange,
    state: editorState,
    typeScriptDiagnostics,
    typeScriptStatus,
  })

  useEffect(() => {
    onDirtyChange?.(
      cachedDocument.path,
      editorState?.isDirty ?? cachedDocument.session.isDirty()
    )
  }, [cachedDocument, editorState?.isDirty, onDirtyChange])

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
    if (editorFocusRequestId === 0) return

    controller.commands.focus()
  }, [controller, editorFocusRequestId])

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
