import type {
  EditorKeymapLayer,
  EditorKeymapOptions,
  EditorPlugin,
  EditorTheme,
} from '@editor/core'
import { EditorHost, useEditor } from '@editor/react'
import type { WorkspaceSearchMatch } from '@workspace/contracts'
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'

import { useWorkspaceFocus } from '@/components/workspace/workspace-focus-state'
import {
  createEditorSyntaxHighlightingPlugins,
  createPlatformSearchResultEditorLoggingPlugin,
} from '@/features/editor/editor-plugins'
import { SearchResultFileLineActions } from '@/features/search/search-result-file-line-actions'
import { SearchResultSourceLineGutter } from '@/features/search/search-result-source-line-gutter'
import {
  EXCERPT_EDITOR_LINE_HEIGHT,
  SEARCH_RESULT_CURSOR_LINE_HIGHLIGHT,
  SEARCH_RESULT_FILE_EDITOR_ROW_GAP,
  SEARCH_RESULT_FILE_EDITOR_TEXT_METRICS,
  SEARCH_RESULT_INACTIVE_EDITOR_KEYMAP,
} from '@/features/search/search-result-editor-constants'
import {
  currentSearchResultFileLine,
  fileBlockLineDigits,
  isSearchResultEditorActionTarget,
  openFileResultOnEnter,
  preventReadonlyInput,
  readonlyEditingKey,
  searchResultFileDocumentId,
  searchResultFileDocumentWindow,
  searchResultFileEditorScrollMode,
  searchResultFileEditorStyle,
  searchResultFileLineIdAtClientY,
  searchResultFileRangeDecorations,
  type SearchResultFileEditorLineWindow,
} from '@/features/search/search-result-editor-utils'
import type { SearchResultId } from '@/features/search/search-result-items'
import {
  searchResultFileDocument,
  type SearchResultFileBlock,
  type SearchResultFileDocumentLine,
  type SearchResultOpenTarget,
} from '@/features/search/search-result-view-model'

type SearchResultFileEditorProps = {
  active: boolean
  activeResultId: SearchResultId | null
  canReplace?: boolean
  editorTheme: EditorTheme
  file: SearchResultFileBlock
  keymapLayers: readonly EditorKeymapLayer[]
  lineWindow: SearchResultFileEditorLineWindow
  replaceVisible: boolean
  onOpenTarget: (target: SearchResultOpenTarget) => void
  onReplaceMatch?: (match: WorkspaceSearchMatch) => void
  onSelectResultWithoutReveal: (id: SearchResultId | null) => void
}

export const SearchResultFileEditor = memo(
  ({
    active,
    activeResultId,
    canReplace,
    editorTheme,
    file,
    keymapLayers,
    lineWindow,
    replaceVisible,
    onOpenTarget,
    onReplaceMatch,
    onSelectResultWithoutReveal,
  }: SearchResultFileEditorProps) => {
    const setFocusArea = useWorkspaceFocus((state) => state.setFocusArea)
    const setActiveEditorCommandDispatch = useWorkspaceFocus(
      (state) => state.setActiveEditorCommandDispatch,
    )
    const fileDocument = useMemo(() => searchResultFileDocument(file), [file])
    const visibleDocument = useMemo(
      () => searchResultFileDocumentWindow(fileDocument, lineWindow),
      [fileDocument, lineWindow],
    )
    const sourceLineDigits = fileBlockLineDigits(file)
    const document = useMemo(
      () => ({
        documentId: searchResultFileDocumentId(file),
        documentMode: 'static' as const,
        languageId: visibleDocument.languageId,
        text: visibleDocument.text,
        textSyncMode: 'incremental' as const,
      }),
      [file, visibleDocument],
    )
    const rangeDecorations = useMemo(
      () => searchResultFileRangeDecorations(visibleDocument, activeResultId),
      [activeResultId, visibleDocument],
    )
    const syntaxPlugins = useMemo(() => createEditorSyntaxHighlightingPlugins(), [])
    const plugins = useMemo(() => createFileResultEditorPlugins(syntaxPlugins), [syntaxPlugins])
    const editorKeymap = useMemo(
      () =>
        active
          ? ({
              defaultBindings: false,
              layers: keymapLayers,
            } satisfies EditorKeymapOptions)
          : SEARCH_RESULT_INACTIVE_EDITOR_KEYMAP,
      [active, keymapLayers],
    )
    const editorStyle = useMemo(
      () => searchResultFileEditorStyle(visibleDocument),
      [visibleDocument],
    )
    const editorScrollMode = searchResultFileEditorScrollMode(visibleDocument.lines.length)
    const controller = useEditor({
      cursorLineHighlight: SEARCH_RESULT_CURSOR_LINE_HIGHLIGHT,
      document,
      editability: 'readonly',
      keymap: editorKeymap,
      lineHeight: EXCERPT_EDITOR_LINE_HEIGHT,
      plugins,
      rangeDecorations,
      rowGap: SEARCH_RESULT_FILE_EDITOR_ROW_GAP,
      scrollMode: editorScrollMode,
      selectionSyncMode: 'none',
      storeSync: 'none',
      textMetrics: SEARCH_RESULT_FILE_EDITOR_TEXT_METRICS,
      theme: editorTheme,
    })
    const pendingActivationFrameRef = useRef<number | null>(null)
    const lineActionRowsRef = useRef(new Map<SearchResultId, HTMLDivElement>())
    const hoveredLineActionRowRef = useRef<HTMLDivElement | null>(null)
    const setHoveredLineActionRow = useCallback((lineId: SearchResultId | null) => {
      const nextRow = lineId ? (lineActionRowsRef.current.get(lineId) ?? null) : null
      if (hoveredLineActionRowRef.current === nextRow) return

      hoveredLineActionRowRef.current?.removeAttribute('data-hovered')
      hoveredLineActionRowRef.current = nextRow
      nextRow?.setAttribute('data-hovered', 'true')
    }, [])

    useEffect(() => {
      if (!active) return

      setActiveEditorCommandDispatch(controller.commands.dispatchCommand)
      return () => setActiveEditorCommandDispatch(null)
    }, [active, controller, setActiveEditorCommandDispatch])

    useEffect(
      () => () => {
        if (pendingActivationFrameRef.current === null) return

        window.cancelAnimationFrame(pendingActivationFrameRef.current)
      },
      [],
    )

    useEffect(
      () => () => {
        setHoveredLineActionRow(null)
      },
      [setHoveredLineActionRow],
    )

    const handleActivate = useCallback(() => {
      setFocusArea('editor')
    }, [setFocusArea])

    const handlePointerUp = useCallback(
      (event: PointerEvent<HTMLDivElement>) => {
        if (isSearchResultEditorActionTarget(event.target)) return

        const nextResultId =
          searchResultFileLineIdAtClientY(fileDocument, event.currentTarget, event.clientY) ??
          file.id
        if (pendingActivationFrameRef.current !== null) {
          window.cancelAnimationFrame(pendingActivationFrameRef.current)
        }
        pendingActivationFrameRef.current = window.requestAnimationFrame(() => {
          pendingActivationFrameRef.current = null
          onSelectResultWithoutReveal(nextResultId)
        })
      },
      [file.id, fileDocument, onSelectResultWithoutReveal],
    )

    const handlePointerMove = useCallback(
      (event: PointerEvent<HTMLDivElement>) => {
        const lineId = searchResultFileLineIdAtClientY(
          fileDocument,
          event.currentTarget,
          event.clientY,
        )
        setHoveredLineActionRow(lineId)
      },
      [fileDocument, setHoveredLineActionRow],
    )

    const handlePointerLeave = useCallback(() => {
      setHoveredLineActionRow(null)
    }, [setHoveredLineActionRow])

    const handleOpen = useCallback(() => {
      const line = currentSearchResultFileLine(visibleDocument, controller)
      if (!line) return

      onOpenTarget({
        match: line.sourceMatch,
        path: file.path,
      })
    }, [controller, file.path, onOpenTarget, visibleDocument])

    const handleOpenLine = useCallback(
      (line: SearchResultFileDocumentLine) => {
        onSelectResultWithoutReveal(line.id)
        onOpenTarget({
          match: line.sourceMatch,
          path: file.path,
        })
      },
      [file.path, onOpenTarget, onSelectResultWithoutReveal],
    )

    const handleReplaceLine = useCallback(
      (line: SearchResultFileDocumentLine) => {
        onSelectResultWithoutReveal(line.id)
        onReplaceMatch?.(line.sourceMatch)
      },
      [onReplaceMatch, onSelectResultWithoutReveal],
    )

    const handleKeyDownCapture = useCallback(
      (event: KeyboardEvent<HTMLDivElement>) => {
        if (openFileResultOnEnter(event, handleOpen)) return
        if (!readonlyEditingKey(event)) return

        event.preventDefault()
        event.stopPropagation()
      },
      [handleOpen],
    )

    return (
      <div
        className='ml-5 min-w-0 rounded-sm border-l border-transparent px-2 py-0.5'
        onBeforeInputCapture={preventReadonlyInput}
        onDropCapture={preventReadonlyInput}
        onFocusCapture={handleActivate}
        onKeyDownCapture={handleKeyDownCapture}
        onPasteCapture={preventReadonlyInput}
        onPointerLeave={handlePointerLeave}
        onPointerMoveCapture={handlePointerMove}
        onPointerDownCapture={handleActivate}
        onPointerUpCapture={handlePointerUp}
      >
        <div
          className='grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-1.5'
          style={{ transform: `translateY(${lineWindow.offsetY}px)` }}
        >
          <div className='grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start'>
            <SearchResultSourceLineGutter document={visibleDocument} minDigits={sourceLineDigits} />
            <EditorHost
              className='app-editor-host search-result-file-editor-host min-w-0'
              controller={controller}
              style={editorStyle}
            />
          </div>
          <SearchResultFileLineActions
            canReplace={canReplace}
            document={visibleDocument}
            lineActionRowsRef={lineActionRowsRef}
            replaceVisible={replaceVisible}
            onOpenLine={handleOpenLine}
            onReplaceLine={handleReplaceLine}
          />
        </div>
      </div>
    )
  },
)

function createFileResultEditorPlugins(syntaxPlugins: readonly EditorPlugin[]) {
  return [...syntaxPlugins, createPlatformSearchResultEditorLoggingPlugin()]
}
