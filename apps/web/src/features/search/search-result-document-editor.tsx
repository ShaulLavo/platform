import "@editor/core/style.css"
import "@editor/find/style.css"
import "@editor/gutters/style.css"
import { createEditorFindPlugin } from "@editor/find"
import { createLineGutterPlugin } from "@editor/gutters"
import { useEditor } from "@editor/react"
import { useEffect, useMemo, useRef, type KeyboardEvent } from "react"
import type {
  EditorKeymapLayer,
  EditorPlugin,
  EditorViewContributionContext,
} from "@editor/core"
import { readonlyEditorKeymapLayers } from "@/keymap"

import { useWorkspaceFocus } from "@/components/workspace/workspace-focus-state"
import { EditorFrame } from "@/features/editor/components/editor-frame"
import { useEditorColorTheme } from "@/features/editor/hooks/use-editor-color-theme"
import {
  searchResultDocumentItemIdAtRow,
  searchResultDocumentSelection,
  searchResultDocumentTargetAtRow,
  type SearchResultDocument,
  type SearchResultOpenTarget,
} from "@/features/search/search-result-document"
import type { SearchResultId } from "@/features/search/search-result-items"

type SearchResultDocumentEditorProps = {
  activeResultId: SearchResultId | null
  document: SearchResultDocument
  documentId: string
  keymapLayers: readonly EditorKeymapLayer[]
  onOpenTarget: (target: SearchResultOpenTarget) => void
  onSelectResult: (id: SearchResultId | null) => void
}

const SEARCH_HIGHLIGHT_STYLE = {
  backgroundColor: "rgba(250, 204, 21, 0.42)",
}
const SEARCH_RESULT_DOCUMENT_ROW_GAP = 6

const SEARCH_RESULT_CURSOR_LINE_HIGHLIGHT = {
  gutterBackground: false,
  gutterNumber: false,
  rowBackground: false,
} as const

export function SearchResultDocumentEditor({
  activeResultId,
  document,
  documentId,
  keymapLayers,
  onOpenTarget,
  onSelectResult,
}: SearchResultDocumentEditorProps) {
  const editorActive = useWorkspaceFocus(
    (state) => state.activeArea === "editor"
  )
  const editorFocusRequestId = useWorkspaceFocus((state) =>
    state.consumeEditorFocusRequest()
  )
  const setActiveEditorCommandDispatch = useWorkspaceFocus(
    (state) => state.setActiveEditorCommandDispatch
  )
  const setFocusArea = useWorkspaceFocus((state) => state.setFocusArea)
  const { editorTheme } = useEditorColorTheme()
  const lastEditorFocusRequestId = useRef(editorFocusRequestId)
  const selection = useMemo(
    () => searchResultDocumentSelection(document, activeResultId),
    [activeResultId, document]
  )
  const readonlyKeymapLayers = useMemo(
    () => readonlyEditorKeymapLayers(keymapLayers),
    [keymapLayers]
  )
  const plugins = useMemo(
    () => [
      createLineGutterPlugin(),
      createEditorFindPlugin(),
      createSearchResultHighlightPlugin(document),
    ],
    [document]
  )
  const editorDocument = useMemo(
    () => ({
      documentId,
      documentMode: "static" as const,
      revision: searchResultDocumentRevision(document),
      text: document.text,
    }),
    [document, documentId]
  )
  const controller = useEditor({
    cursorLineHighlight: SEARCH_RESULT_CURSOR_LINE_HIGHLIGHT,
    document: editorDocument,
    editability: "readonly",
    keymap: {
      defaultBindings: false,
      layers: readonlyKeymapLayers,
    },
    plugins,
    rowGap: SEARCH_RESULT_DOCUMENT_ROW_GAP,
    theme: editorTheme,
  })
  const editorState = controller.useState()

  useEffect(() => {
    if (editorFocusRequestId === 0) return
    if (lastEditorFocusRequestId.current === editorFocusRequestId) return

    lastEditorFocusRequestId.current = editorFocusRequestId
    if (!editorActive) return

    controller.commands.focus()
  }, [controller, editorActive, editorFocusRequestId])

  useEffect(() => {
    if (!selection) return
    if (activeTextInputOutsideEditor()) return

    controller.commands.setSelection(selection.start, selection.end, {
      reveal: false,
    })
  }, [controller, selection])

  useEffect(() => {
    setActiveEditorCommandDispatch(controller.commands.dispatchCommand)

    return () => setActiveEditorCommandDispatch(null)
  }, [controller, setActiveEditorCommandDispatch])

  useEffect(() => {
    if (activeTextInputOutsideEditor()) return

    const row = editorState?.cursor.row
    if (row === undefined) return

    const itemId = searchResultDocumentItemIdAtRow(document, row)
    if (itemId === activeResultId) return

    onSelectResult(itemId)
  }, [activeResultId, document, editorState?.cursor.row, onSelectResult])

  function handleKeyDownCapture(event: KeyboardEvent<HTMLDivElement>) {
    if (openCurrentRowOnEnter(event, controller.getState()?.cursor.row)) return
    if (!readonlyEditingKey(event)) return

    event.preventDefault()
    event.stopPropagation()
  }

  function openCurrentRowOnEnter(
    event: KeyboardEvent<HTMLDivElement>,
    row: number | undefined
  ) {
    if (event.key !== "Enter") return false
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return false
    if (row === undefined) return false

    const target = searchResultDocumentTargetAtRow(document, row)
    if (!target) return false

    event.preventDefault()
    event.stopPropagation()
    onOpenTarget(target)
    return true
  }

  return (
    <div
      className="flex h-full min-h-0 min-w-0 overflow-hidden bg-background text-foreground"
      onBeforeInputCapture={preventReadonlyInput}
      onDropCapture={preventReadonlyInput}
      onKeyDownCapture={handleKeyDownCapture}
      onPasteCapture={preventReadonlyInput}
    >
      <EditorFrame
        active={editorActive}
        controller={controller}
        onActivate={() => setFocusArea("editor")}
      />
    </div>
  )
}

function createSearchResultHighlightPlugin(
  document: SearchResultDocument
): EditorPlugin {
  return {
    name: "search-result-document-highlights",
    activate: (context) =>
      context.registerViewContribution({
        createContribution: (view) => {
          syncSearchResultHighlights(view, document)

          return {
            dispose: () => {
              view.clearRangeHighlight?.("search-result-match")
            },
            update: () => syncSearchResultHighlights(view, document),
          }
        },
      }),
  }
}

function syncSearchResultHighlights(
  view: EditorViewContributionContext,
  document: SearchResultDocument
) {
  if (!canUseCssRangeHighlights()) return
  if (document.highlights.length === 0) {
    view.clearRangeHighlight?.("search-result-match")
    return
  }

  try {
    view.setRangeHighlight?.(
      "search-result-match",
      document.highlights,
      SEARCH_HIGHLIGHT_STYLE
    )
  } catch {
    view.clearRangeHighlight?.("search-result-match")
  }
}

function canUseCssRangeHighlights() {
  const css = globalThis.CSS as { highlights?: unknown } | undefined
  if (!css?.highlights) return false

  return typeof globalThis.Highlight === "function"
}

function activeTextInputOutsideEditor() {
  const element = globalThis.document?.activeElement
  if (!(element instanceof HTMLElement)) return false
  if (element.closest(".app-editor-host")) return false
  if (element instanceof HTMLInputElement) return true
  if (element instanceof HTMLTextAreaElement) return true

  return element.isContentEditable
}

function preventReadonlyInput(event: {
  preventDefault(): void
  stopPropagation(): void
}) {
  event.preventDefault()
  event.stopPropagation()
}

function readonlyEditingKey(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key === "Backspace") return true
  if (event.key === "Delete") return true
  if (event.key === "Tab") return true
  if (event.key !== "Enter") return false

  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
}

function searchResultDocumentRevision(document: SearchResultDocument) {
  let hash = 0x811c9dc5
  for (let index = 0; index < document.text.length; index += 1) {
    hash ^= document.text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return `${document.text.length}:${(hash >>> 0).toString(36)}`
}
