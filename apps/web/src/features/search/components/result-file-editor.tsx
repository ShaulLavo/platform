import type {
  EditorKeymapLayer,
  EditorKeymapOptions,
  EditorPlugin,
  EditorTheme,
} from '@singapor/core'
import { EditorHost, useEditor } from '@singapor/react'
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'

import { useFocus } from '@/features/workspace/providers/focus-state'
import {
  createPlatformSearchResultEditorLoggingPlugin,
  editorTreeSitterSyntaxProvider,
} from '@/features/editor/utils/plugins'
import { useSearchResultActions } from '@/features/search/hooks/use-result-actions'
import { SearchResultFileLineActions } from '@/features/search/components/result-file-line-actions'
import { SearchResultSourceLineGutter } from '@/features/search/components/result-source-line-gutter'
import { createSearchResultSyntaxHighlightingPlugin } from '@/features/search/utils/result-syntax-plugin'
import {
  EXCERPT_EDITOR_LINE_HEIGHT,
  SEARCH_RESULT_CURSOR_LINE_HIGHLIGHT,
  SEARCH_RESULT_FILE_EDITOR_ROW_GAP,
  SEARCH_RESULT_FILE_EDITOR_TEXT_METRICS,
  SEARCH_RESULT_INACTIVE_EDITOR_KEYMAP,
} from '@/features/search/utils/result-editor-constants'
import {
  currentSearchResultFileLine,
  fileBlockLineDigits,
  isSearchResultEditorActionTarget,
  openFileResultOnEnter,
  preventReadonlyInput,
  readonlyEditingKey,
  searchResultFileDocumentId,
  searchResultFileDocumentRevision,
  searchResultFileDocumentWindow,
  searchResultFileEditorScrollMode,
  searchResultFileEditorStyle,
  searchResultFileLineIdAtClientY,
  searchResultFileRangeDecorations,
  type SearchResultFileEditorLineWindow,
} from '@/features/search/utils/result-editor'
import type { SearchResultId } from '@/features/search/utils/result-items'
import {
  searchResultFileDocument,
  type SearchResultFileBlock,
  type SearchResultFileDocumentLine,
} from '@/features/search/utils/result-view-model'

type SearchResultFileEditorProps = {
  active: boolean
  activeResultId: SearchResultId | null
  canReplace?: boolean
  editorTheme: EditorTheme
  file: SearchResultFileBlock
  keymapLayers: readonly EditorKeymapLayer[]
  lineWindow: SearchResultFileEditorLineWindow
  replaceVisible: boolean
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
  }: SearchResultFileEditorProps) => {
    const { openTarget, replaceMatch, selectResultWithoutReveal } = useSearchResultActions()
    const setFocusArea = useFocus((state) => state.setFocusArea)
    const setActiveEditorCommandDispatch = useFocus((state) => state.setActiveEditorCommandDispatch)
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
        revision: searchResultFileDocumentRevision(visibleDocument, lineWindow),
        text: visibleDocument.text,
        textSyncMode: 'open' as const,
      }),
      [file, lineWindow, visibleDocument],
    )
    const rangeDecorations = useMemo(
      () => searchResultFileRangeDecorations(visibleDocument, activeResultId),
      [activeResultId, visibleDocument],
    )
    const syntaxPlugins = useMemo(
      () => [createSearchResultSyntaxHighlightingPlugin(editorTreeSitterSyntaxProvider())],
      [],
    )
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
          selectResultWithoutReveal(nextResultId)
        })
      },
      [file.id, fileDocument, selectResultWithoutReveal],
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

      openTarget({
        match: line.sourceMatch,
        path: file.path,
      })
    }, [controller, file.path, openTarget, visibleDocument])

    const handleOpenLine = useCallback(
      (line: SearchResultFileDocumentLine) => {
        selectResultWithoutReveal(line.id)
        openTarget({
          match: line.sourceMatch,
          path: file.path,
        })
      },
      [file.path, openTarget, selectResultWithoutReveal],
    )

    const handleReplaceLine = useCallback(
      (line: SearchResultFileDocumentLine) => {
        selectResultWithoutReveal(line.id)
        replaceMatch(line.sourceMatch)
      },
      [replaceMatch, selectResultWithoutReveal],
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
