import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import type {
  EditorKeymapLayer,
  EditorKeymapOptions,
  EditorPlugin,
  EditorTheme,
} from '@editor/core'
import { createEditorFindPlugin } from '@editor/find'
import { EditorHost, useEditor } from '@editor/react'
import type { WorkspaceSearchMatch } from '@workspace/contracts'
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'

import { useWorkspaceFocus } from '@/components/workspace/workspace-focus-state'
import {
  EMPTY_EDITOR_PLUGINS,
  EMPTY_RANGE_DECORATIONS,
  EXCERPT_EDITOR_LINE_HEIGHT,
  SEARCH_RESULT_CURSOR_LINE_HIGHLIGHT,
  SEARCH_RESULT_FILE_EDITOR_POOL_HIDDEN_STYLE,
  SEARCH_RESULT_FILE_EDITOR_ROW_GAP,
  SEARCH_RESULT_FILE_EDITOR_TEXT_METRICS,
  SEARCH_RESULT_INACTIVE_EDITOR_KEYMAP,
} from '@/features/search/search-result-editor-constants'
import type { SearchResultFileEditorPoolEntry } from '@/features/search/search-result-editor-types'
import {
  currentSearchResultFileLine,
  fileBlockLineDigits,
  isSearchResultEditorActionTarget,
  openFileResultOnEnter,
  preventReadonlyInput,
  readonlyEditingKey,
  searchResultDomId,
  searchResultFileContainsId,
  searchResultFileDocumentId,
  searchResultFileEditorStyle,
  searchResultFileLineIdAtClientY,
  searchResultFileRangeDecorations,
  searchResultLineActionClassName,
  searchResultLineActionsStyle,
  searchResultLineOpenLabel,
  searchResultSourceLineGutterStyle,
  searchResultVirtualRowStyle,
} from '@/features/search/search-result-editor-utils'
import type { SearchResultId } from '@/features/search/search-result-items'
import {
  searchResultFileDocument,
  searchResultVirtualRowId,
  type SearchResultFileBlock,
  type SearchResultFileDocument,
  type SearchResultFileDocumentLine,
  type SearchResultOpenTarget,
} from '@/features/search/search-result-view-model'
import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'

export function SearchResultFileEditorPoolSlot({
  activeResultId,
  canReplace,
  deferredPluginsReady,
  editorTheme,
  entry,
  keymapLayers,
  replaceVisible,
  syntaxPlugins,
  treeId,
  onEnableDeferredPlugins,
  onOpenTarget,
  onReplaceMatch,
  onSelectResultWithoutReveal,
}: {
  activeResultId: SearchResultId | null
  canReplace?: boolean
  deferredPluginsReady: boolean
  editorTheme: EditorTheme
  entry: SearchResultFileEditorPoolEntry
  keymapLayers: readonly EditorKeymapLayer[]
  replaceVisible: boolean
  syntaxPlugins: readonly EditorPlugin[]
  treeId: string
  onEnableDeferredPlugins: () => void
  onOpenTarget: (target: SearchResultOpenTarget) => void
  onReplaceMatch?: (match: WorkspaceSearchMatch) => void
  onSelectResultWithoutReveal: (id: SearchResultId | null) => void
}) {
  const { item, visible } = entry
  const row = item.row
  const file = row.file
  const id = searchResultVirtualRowId(row)
  const active = visible && searchResultFileContainsId(file, activeResultId)

  return (
    <div
      aria-hidden={visible ? undefined : true}
      aria-level={visible ? 2 : undefined}
      aria-selected={visible ? active : undefined}
      className='absolute right-2 left-2'
      data-index={visible ? item.virtualItem.index : undefined}
      id={id && visible ? searchResultDomId(treeId, id) : undefined}
      role={visible ? 'treeitem' : undefined}
      style={
        visible
          ? searchResultVirtualRowStyle(item.virtualItem)
          : SEARCH_RESULT_FILE_EDITOR_POOL_HIDDEN_STYLE
      }
    >
      <SearchResultFileEditor
        active={active}
        activeResultId={active ? activeResultId : null}
        canReplace={canReplace}
        deferredPluginsReady={deferredPluginsReady}
        editorTheme={editorTheme}
        file={file}
        keymapLayers={keymapLayers}
        replaceVisible={replaceVisible}
        syntaxPlugins={syntaxPlugins}
        visible={visible}
        onEnableDeferredPlugins={onEnableDeferredPlugins}
        onOpenTarget={onOpenTarget}
        onReplaceMatch={onReplaceMatch}
        onSelectResultWithoutReveal={onSelectResultWithoutReveal}
      />
    </div>
  )
}

type SearchResultFileEditorProps = {
  active: boolean
  activeResultId: SearchResultId | null
  canReplace?: boolean
  editorTheme: EditorTheme
  file: SearchResultFileBlock
  keymapLayers: readonly EditorKeymapLayer[]
  replaceVisible: boolean
  deferredPluginsReady: boolean
  syntaxPlugins: readonly EditorPlugin[]
  visible: boolean
  onEnableDeferredPlugins: () => void
  onOpenTarget: (target: SearchResultOpenTarget) => void
  onReplaceMatch?: (match: WorkspaceSearchMatch) => void
  onSelectResultWithoutReveal: (id: SearchResultId | null) => void
}

const SearchResultFileEditor = memo(
  ({
    active,
    activeResultId,
    canReplace,
    editorTheme,
    file,
    keymapLayers,
    replaceVisible,
    deferredPluginsReady,
    syntaxPlugins,
    visible,
    onEnableDeferredPlugins,
    onOpenTarget,
    onReplaceMatch,
    onSelectResultWithoutReveal,
  }: SearchResultFileEditorProps) => {
    const setFocusArea = useWorkspaceFocus((state) => state.setFocusArea)
    const setActiveEditorCommandDispatch = useWorkspaceFocus(
      (state) => state.setActiveEditorCommandDispatch,
    )
    const fileDocument = useMemo(() => searchResultFileDocument(file), [file])
    const sourceLineDigits = fileBlockLineDigits(file)
    const document = useMemo(
      () => ({
        documentId: searchResultFileDocumentId(file),
        documentMode: 'static' as const,
        languageId: fileDocument.languageId,
        text: fileDocument.text,
        textSyncMode: 'incremental' as const,
      }),
      [file, fileDocument],
    )
    const rangeDecorations = useMemo(
      () =>
        visible
          ? searchResultFileRangeDecorations(fileDocument, activeResultId)
          : EMPTY_RANGE_DECORATIONS,
      [activeResultId, fileDocument, visible],
    )
    const findPlugin = useMemo(() => {
      if (!active) return null
      if (!visible) return null
      if (!deferredPluginsReady) return null

      return createEditorFindPlugin()
    }, [active, deferredPluginsReady, visible])
    const effectiveSyntaxPlugins = visible ? syntaxPlugins : EMPTY_EDITOR_PLUGINS
    const plugins = useMemo(
      () => fileResultEditorPlugins(effectiveSyntaxPlugins, findPlugin),
      [effectiveSyntaxPlugins, findPlugin],
    )
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
    const editorStyle = useMemo(() => searchResultFileEditorStyle(fileDocument), [fileDocument])
    const [hoveredLineId, setHoveredLineId] = useState<SearchResultId | null>(null)
    const controller = useEditor({
      cursorLineHighlight: SEARCH_RESULT_CURSOR_LINE_HIGHLIGHT,
      document,
      editability: 'readonly',
      keymap: editorKeymap,
      lineHeight: EXCERPT_EDITOR_LINE_HEIGHT,
      plugins,
      rangeDecorations,
      rowGap: SEARCH_RESULT_FILE_EDITOR_ROW_GAP,
      selectionSyncMode: 'none',
      storeSync: 'none',
      textMetrics: SEARCH_RESULT_FILE_EDITOR_TEXT_METRICS,
      theme: editorTheme,
    })
    const pendingActivationFrameRef = useRef<number | null>(null)

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

    function handleActivate() {
      onEnableDeferredPlugins()
      setFocusArea('editor')
    }

    function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
      if (isSearchResultEditorActionTarget(event.target)) return

      const nextResultId =
        searchResultFileLineIdAtClientY(fileDocument, event.currentTarget, event.clientY) ?? file.id
      if (pendingActivationFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingActivationFrameRef.current)
      }
      pendingActivationFrameRef.current = window.requestAnimationFrame(() => {
        pendingActivationFrameRef.current = null
        onSelectResultWithoutReveal(nextResultId)
      })
    }

    function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
      const lineId = searchResultFileLineIdAtClientY(
        fileDocument,
        event.currentTarget,
        event.clientY,
      )
      setHoveredLineId((current) => (current === lineId ? current : lineId))
    }

    function handlePointerLeave() {
      setHoveredLineId(null)
    }

    function handleKeyDownCapture(event: KeyboardEvent<HTMLDivElement>) {
      if (openFileResultOnEnter(event, handleOpen)) return
      if (!readonlyEditingKey(event)) return

      event.preventDefault()
      event.stopPropagation()
    }

    function handleOpen() {
      const line = currentSearchResultFileLine(fileDocument, controller)
      if (!line) return

      onOpenTarget({
        match: line.sourceMatch,
        path: file.path,
      })
    }

    function handleOpenLine(line: SearchResultFileDocumentLine) {
      onSelectResultWithoutReveal(line.id)
      onOpenTarget({
        match: line.sourceMatch,
        path: file.path,
      })
    }

    function handleReplaceLine(line: SearchResultFileDocumentLine) {
      onSelectResultWithoutReveal(line.id)
      onReplaceMatch?.(line.sourceMatch)
    }

    return (
      <div
        className='ml-5 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-1.5 rounded-sm border-l border-transparent px-2 py-0.5'
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
        <div className='grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start'>
          <SearchResultSourceLineGutter document={fileDocument} minDigits={sourceLineDigits} />
          <EditorHost
            className='app-editor-host search-result-file-editor-host min-w-0'
            controller={controller}
            style={editorStyle}
          />
        </div>
        <SearchResultFileLineActions
          activeResultId={activeResultId}
          canReplace={canReplace}
          document={fileDocument}
          hoveredLineId={hoveredLineId}
          replaceVisible={replaceVisible}
          onOpenLine={handleOpenLine}
          onReplaceLine={handleReplaceLine}
        />
      </div>
    )
  },
)
SearchResultFileEditor.displayName = 'SearchResultFileEditor'

function SearchResultFileLineActions({
  activeResultId,
  canReplace,
  document,
  hoveredLineId,
  replaceVisible,
  onOpenLine,
  onReplaceLine,
}: {
  activeResultId: SearchResultId | null
  canReplace?: boolean
  document: SearchResultFileDocument
  hoveredLineId: SearchResultId | null
  replaceVisible: boolean
  onOpenLine: (line: SearchResultFileDocumentLine) => void
  onReplaceLine: (line: SearchResultFileDocumentLine) => void
}) {
  return (
    <div className='grid shrink-0' style={searchResultLineActionsStyle(document.lines.length)}>
      {document.lines.map((line) => (
        <SearchResultFileLineActionRow
          active={line.id === activeResultId || line.id === hoveredLineId}
          canReplace={canReplace}
          key={line.id}
          line={line}
          replaceVisible={replaceVisible}
          onOpenLine={onOpenLine}
          onReplaceLine={onReplaceLine}
        />
      ))}
    </div>
  )
}

function SearchResultFileLineActionRow({
  active,
  canReplace,
  line,
  replaceVisible,
  onOpenLine,
  onReplaceLine,
}: {
  active: boolean
  canReplace?: boolean
  line: SearchResultFileDocumentLine
  replaceVisible: boolean
  onOpenLine: (line: SearchResultFileDocumentLine) => void
  onReplaceLine: (line: SearchResultFileDocumentLine) => void
}) {
  function handleOpenClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    onOpenLine(line)
  }

  function handleReplaceClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    onReplaceLine(line)
  }

  return (
    <div className='flex items-center justify-end gap-0.5'>
      <Button
        aria-label={searchResultLineOpenLabel(line)}
        className={searchResultLineActionClassName(active)}
        size='icon-xs'
        title={searchResultLineOpenLabel(line)}
        type='button'
        variant='ghost'
        onClick={handleOpenClick}
      >
        <ArrowSquareOutIcon className='size-3.5' />
      </Button>
      {replaceVisible ? (
        <Button
          className={cn('h-5 px-1.5 text-[10px]', searchResultLineActionClassName(active))}
          disabled={!canReplace}
          size='xs'
          title='Replace this match'
          type='button'
          variant='ghost'
          onClick={handleReplaceClick}
        >
          Replace
        </Button>
      ) : null}
    </div>
  )
}

function SearchResultSourceLineGutter({
  document,
  minDigits,
}: {
  document: SearchResultFileDocument
  minDigits: number
}) {
  return (
    <div
      aria-hidden='true'
      className='text-muted-foreground box-border grid shrink-0 overflow-hidden pr-2 text-right font-mono text-[13px] select-none'
      style={searchResultSourceLineGutterStyle(document.lines.length, minDigits)}
    >
      {document.lines.map((line) => (
        <span className='block overflow-hidden leading-[22px] tabular-nums' key={line.id}>
          {line.sourceLine}
        </span>
      ))}
    </div>
  )
}

function fileResultEditorPlugins(
  syntaxPlugins: readonly EditorPlugin[],
  findPlugin: EditorPlugin | null,
) {
  if (syntaxPlugins.length === 0 && !findPlugin) return EMPTY_EDITOR_PLUGINS

  if (!findPlugin) return Array.from(syntaxPlugins)

  return syntaxPlugins.concat(findPlugin)
}
