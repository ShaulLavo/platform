import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@workspace/ui/components/command'
import { cn } from '@workspace/ui/lib/utils'
import { CommandIcon, FileIcon, TerminalWindowIcon, TextTIcon } from '@phosphor-icons/react'
import { useCallback, useLayoutEffect, useMemo, useState } from 'react'

import { useTheme, type Theme } from '@/components/theme-context'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import {
  useEditorDocumentState,
  useEditorDocumentStoreApi,
} from '@/features/editor/state/editor-document-state'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { parseSearchBufferDocumentId } from '@/features/search/search-buffer-document'
import { fetchDocumentSymbols, type FlatDocumentSymbol } from '@/lib/document-symbols'
import { fetchQuickOpenFiles } from '@/lib/file-server'
import { isFileEntry, type TreeEntry } from '@/lib/file-system-types'
import type { LoadState } from '@/lib/load-state'
import { basename, displayPath, toTreePath } from '@/lib/path-formatters'
import { documentSymbolKeys, fileSystemKeys } from '@/lib/query-keys'
import type { TreeModel } from '@/lib/tree-model'
import {
  isEditorPlatformCommandId,
  platformCommandSpecs,
  type CommandSpec,
  type PlatformCommandDispatch,
  type PlatformCommandId,
  type PlatformKeyBinding,
} from '@/keymap'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fuzzyRankScore } from '@workspace/contracts'

type CommandPaletteProps = {
  readonly bindings: readonly PlatformKeyBinding[]
  readonly dispatch: PlatformCommandDispatch
  readonly onOpenChange: (open: boolean) => void
  readonly onSearchChange: (search: string) => void
  readonly open: boolean
  readonly search: string
  readonly treeState: LoadState<TreeModel>
}

type CommandPaletteItem = {
  readonly spec: CommandSpec
  readonly shortcut: string | null
}

type FilePaletteItem = {
  readonly entry: TreeEntry
  readonly pathLabel: string
}

type ViewPaletteItem = {
  readonly command: PlatformCommandId
  readonly description: string
  readonly title: string
  readonly value: string
}

type ColorModePaletteItem = {
  readonly command: PlatformCommandId
  readonly description: string
  readonly mode: Theme
  readonly title: string
  readonly value: string
}

type EditorPaletteItem = {
  readonly active: boolean
  readonly name: string
  readonly path: string
  readonly pathLabel: string
}

const paletteModeCommands = new Set<PlatformCommandId>([
  'workspace.gotoSymbol',
  'workspace.quickOpenView',
  'workspace.selectColorMode',
  'workspace.showAllEditors',
  'workspace.showCommandPalette',
  'workspace.showQuickAccess',
])

const selectedFileCommands = new Set<PlatformCommandId>([
  'workspace.closeCurrentTab',
  'workspace.gotoSymbol',
  'workspace.revertFile',
  'workspace.saveFile',
])

const hiddenCommandPaletteCommands = new Set<PlatformCommandId>([
  'workspace.setDarkTheme',
  'workspace.setLightTheme',
  'workspace.setSystemTheme',
  'workspace.showCommandPalette',
])

const workspaceOptionalCommands = new Set<PlatformCommandId>([
  'workspace.openFilePicker',
  'workspace.selectColorMode',
  'workspace.setDarkTheme',
  'workspace.setLightTheme',
  'workspace.setSystemTheme',
  'workspace.showCommandPalette',
])

const viewPaletteItems: readonly ViewPaletteItem[] = [
  {
    command: 'workspace.focusFileTree',
    description: 'Focus the workspace file explorer.',
    title: 'Explorer',
    value: 'view:explorer',
  },
  {
    command: 'workspace.focusGit',
    description: 'Focus source control.',
    title: 'Source Control',
    value: 'view:source-control',
  },
  {
    command: 'workspace.focusEditor',
    description: 'Focus the active editor.',
    title: 'Editor',
    value: 'view:editor',
  },
  {
    command: 'workspace.openFilePicker',
    description: 'Choose a workspace folder.',
    title: 'Open Folder',
    value: 'view:open-folder',
  },
]

const colorModePaletteItems: readonly ColorModePaletteItem[] = [
  {
    command: 'workspace.setLightTheme',
    description: 'Use light color mode.',
    mode: 'light',
    title: 'Light',
    value: 'color-mode:light',
  },
  {
    command: 'workspace.setDarkTheme',
    description: 'Use dark color mode.',
    mode: 'dark',
    title: 'Dark',
    value: 'color-mode:dark',
  },
  {
    command: 'workspace.setSystemTheme',
    description: 'Follow the system color mode.',
    mode: 'system',
    title: 'System',
    value: 'color-mode:system',
  },
]

export function CommandPalette({
  bindings,
  dispatch,
  onOpenChange,
  onSearchChange,
  open,
  search,
  treeState,
}: CommandPaletteProps) {
  const { theme } = useTheme()
  const hasWorkspace = useEditorWorkspaceState((state) => Boolean(state.rootFolder))
  const rootFolder = useEditorWorkspaceState((state) => state.rootFolder)
  const openFilePaths = useEditorWorkspaceState((state) => state.openFilePaths)
  const selectedFilePath = useEditorWorkspaceState((state) => state.selectedFilePath)
  const documentStore = useEditorDocumentStoreApi()
  const { openDefinition, selectFile } = useEditorCommands()
  const [selectedFileItemValue, setSelectedFileItemValue] = useState<string | null>(null)
  const mode = quickAccessMode(search)
  const query = quickAccessQuery(search)
  const fileQuery = query.trim()
  const items = useMemo(() => commandPaletteItems(platformCommandSpecs, bindings), [bindings])
  const groups = useMemo(() => groupedCommandItems(items), [items])
  const fileItems = useMemo(() => filePaletteItems(treeState), [treeState])
  const editorItems = useMemo(
    () => editorPaletteItems(openFilePaths, selectedFilePath),
    [openFilePaths, selectedFilePath],
  )
  const fileSearchEnabled = open && mode === 'files' && Boolean(rootFolder && fileQuery)
  const fileSearchQuery = useQuery({
    enabled: fileSearchEnabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      fetchQuickOpenFiles({
        path: rootFolder?.path ?? '',
        query: fileQuery,
        signal,
      }),
    queryKey: fileSystemKeys.quickOpenFiles(rootFolder?.path ?? '', fileQuery),
    staleTime: 5_000,
  })
  const searchedFileItems = useMemo(
    () => searchFilePaletteItems(fileSearchQuery.data ?? [], rootFolder?.path ?? ''),
    [fileSearchQuery.data, rootFolder?.path],
  )
  const visibleFileItems = fileSearchEnabled ? searchedFileItems : fileItems
  const selectedCommandValue =
    mode === 'files' ? selectedFileCommandValue(selectedFileItemValue, visibleFileItems) : undefined

  useLayoutEffect(() => {
    if (!open || mode !== 'files') return

    document.querySelector<HTMLElement>('[data-slot="command-list"]')?.scrollTo({ top: 0 })
  }, [fileQuery, fileSearchQuery.data, mode, open])

  const selectedFileBackedPath = fileBackedPath(selectedFilePath)
  const symbolsEnabled = mode === 'symbols' && Boolean(rootFolder && selectedFileBackedPath)
  const selectedDocumentContentRevision = useEditorDocumentState((state) =>
    symbolsEnabled && selectedFileBackedPath
      ? (state.documentContentRevisions[selectedFileBackedPath] ?? null)
      : null,
  )
  const symbolQuery = useQuery({
    enabled: symbolsEnabled,
    queryFn: ({ signal }) => {
      const selectedDocument = selectedFileBackedPath
        ? documentStore.getState().documents[selectedFileBackedPath]
        : null

      return fetchDocumentSymbols({
        path: selectedFileBackedPath ?? '',
        rootPath: rootFolder?.path ?? '',
        signal,
        text: selectedDocument?.session.isDirty()
          ? selectedDocument.session.materializeFullText()
          : null,
      })
    },
    queryKey: documentSymbolKeys.document(
      rootFolder?.path ?? '',
      selectedFileBackedPath ?? '',
      selectedDocumentContentRevision ?? 'disk',
    ),
  })
  const runCommand = useCallback(
    (command: PlatformCommandId) => {
      if (isCommandDisabled(command, hasWorkspace, selectedFilePath)) return

      const handled = dispatch(command)
      if (handled === false) return
      if (commandKeepsPaletteOpen(command)) return

      onOpenChange(false)
    },
    [dispatch, hasWorkspace, onOpenChange, selectedFilePath],
  )
  const handleCommandValueChange = useCallback(
    (value: string) => {
      if (mode !== 'files') return

      setSelectedFileItemValue(value)
    },
    [mode, setSelectedFileItemValue],
  )
  const handleSearchChange = useCallback(
    (value: string) => {
      if (quickAccessMode(value) === 'files') {
        setSelectedFileItemValue(null)
      }

      onSearchChange(value)
    },
    [onSearchChange, setSelectedFileItemValue],
  )
  const openFile = useCallback(
    (path: string) => {
      selectFile(path)
      onOpenChange(false)
    },
    [onOpenChange, selectFile],
  )
  const openSymbol = useCallback(
    (symbol: FlatDocumentSymbol) => {
      if (!selectedFilePath) return

      const handled = openDefinition({
        path: selectedFilePath,
        range: symbol.selectionRange,
        uri: fileUriForPath(selectedFilePath),
      })
      if (handled === false) return

      onOpenChange(false)
    },
    [onOpenChange, openDefinition, selectedFilePath],
  )

  return (
    <CommandDialog
      commandProps={{
        filter: quickAccessFilter,
        loop: true,
        onValueChange: handleCommandValueChange,
        shouldFilter: mode !== 'files',
        value: selectedCommandValue,
      }}
      open={open}
      onOpenChange={onOpenChange}
    >
      <CommandInput
        placeholder={placeholderForMode(mode)}
        value={search}
        onValueChange={handleSearchChange}
      />
      <CommandList>
        <CommandEmpty>{emptyLabelForMode(mode)}</CommandEmpty>
        {mode === 'commands' ? (
          <CommandGroups
            groups={groups}
            hasWorkspace={hasWorkspace}
            selectedFilePath={selectedFilePath}
            onSelect={runCommand}
          />
        ) : mode === 'views' ? (
          <ViewGroups hasWorkspace={hasWorkspace} onSelect={runCommand} />
        ) : mode === 'colorMode' ? (
          <ColorModeGroups currentTheme={theme} onSelect={runCommand} />
        ) : mode === 'editors' ? (
          <EditorGroups items={editorItems} onSelect={openFile} />
        ) : mode === 'symbols' ? (
          <SymbolGroups
            isPending={symbolsEnabled && symbolQuery.isPending}
            items={symbolQuery.data ?? []}
            onSelect={openSymbol}
          />
        ) : (
          <QuickOpenGroups
            files={visibleFileItems}
            hasWorkspace={hasWorkspace}
            query={fileQuery}
            searchError={fileSearchQuery.isError}
            onFileSelect={openFile}
          />
        )}
      </CommandList>
    </CommandDialog>
  )
}

function CommandGroups({
  groups,
  hasWorkspace,
  selectedFilePath,
  onSelect,
}: {
  readonly groups: readonly (readonly [string, readonly CommandPaletteItem[]])[]
  readonly hasWorkspace: boolean
  readonly selectedFilePath: string | null
  readonly onSelect: (command: PlatformCommandId) => void
}) {
  return (
    <>
      {groups.map(([category, groupItems]) => (
        <CommandGroup key={category} heading={category}>
          {groupItems.map((item) => (
            <CommandPaletteRow
              disabled={isCommandDisabled(item.spec.id, hasWorkspace, selectedFilePath)}
              item={item}
              key={item.spec.id}
              onSelect={onSelect}
            />
          ))}
        </CommandGroup>
      ))}
    </>
  )
}

function QuickOpenGroups({
  files,
  hasWorkspace,
  query,
  searchError,
  onFileSelect,
}: {
  readonly files: readonly FilePaletteItem[]
  readonly hasWorkspace: boolean
  readonly query: string
  readonly searchError: boolean
  readonly onFileSelect: (path: string) => void
}) {
  if (!hasWorkspace) {
    return null
  }

  return (
    <CommandGroup heading='Files'>
      {searchError && (
        <CommandItem disabled keywords={[query]} value={`files:error:${query}`}>
          <FileIcon className='text-muted-foreground' />
          <span className='text-muted-foreground text-sm'>File search failed</span>
        </CommandItem>
      )}
      {files.map((item) => (
        <FilePaletteRow item={item} key={item.entry.path} onSelect={onFileSelect} />
      ))}
    </CommandGroup>
  )
}

function ColorModeGroups({
  currentTheme,
  onSelect,
}: {
  readonly currentTheme: Theme
  readonly onSelect: (command: PlatformCommandId) => void
}) {
  return (
    <CommandGroup heading='Color Mode'>
      {colorModePaletteItems.map((item) => (
        <CommandItem
          key={item.value}
          keywords={[item.title, item.description, item.command]}
          value={item.value}
          onSelect={() => onSelect(item.command)}
        >
          <CommandIcon className='text-muted-foreground' />
          <span className='min-w-0 flex-1'>
            <span className='block truncate font-medium'>{item.title}</span>
            <span className='text-muted-foreground block truncate text-[11px]'>
              {item.description}
            </span>
          </span>
          {item.mode === currentTheme && <CommandShortcut>active</CommandShortcut>}
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

function ViewGroups({
  hasWorkspace,
  onSelect,
}: {
  readonly hasWorkspace: boolean
  readonly onSelect: (command: PlatformCommandId) => void
}) {
  return (
    <CommandGroup heading='Views'>
      {viewPaletteItems.map((item) => (
        <CommandItem
          disabled={!hasWorkspace && item.command !== 'workspace.openFilePicker'}
          key={item.value}
          keywords={[item.title, item.description, item.command]}
          value={item.value}
          onSelect={() => onSelect(item.command)}
        >
          <TerminalWindowIcon className='text-muted-foreground' />
          <span className='min-w-0 flex-1'>
            <span className='block truncate font-medium'>{item.title}</span>
            <span className='text-muted-foreground block truncate text-[11px]'>
              {item.description}
            </span>
          </span>
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

function EditorGroups({
  items,
  onSelect,
}: {
  readonly items: readonly EditorPaletteItem[]
  readonly onSelect: (path: string) => void
}) {
  return (
    <CommandGroup heading='Open Editors'>
      {items.map((item) => (
        <CommandItem
          key={item.path}
          keywords={[item.name, item.path, item.pathLabel]}
          value={`editor:${item.path}`}
          onSelect={() => onSelect(item.path)}
        >
          <FileIcon className='text-muted-foreground' />
          <span className='min-w-0 flex-1'>
            <span className='block truncate font-medium'>{item.name}</span>
            <span className='text-muted-foreground block truncate text-[11px]'>
              {item.pathLabel}
            </span>
          </span>
          {item.active && <CommandShortcut>active</CommandShortcut>}
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

function SymbolGroups({
  isPending,
  items,
  onSelect,
}: {
  readonly isPending: boolean
  readonly items: readonly FlatDocumentSymbol[]
  readonly onSelect: (symbol: FlatDocumentSymbol) => void
}) {
  if (isPending) {
    return (
      <CommandGroup heading='Symbols'>
        <CommandItem disabled value='symbols:loading'>
          <TextTIcon className='text-muted-foreground' />
          <span className='text-muted-foreground text-sm'>Loading symbols</span>
        </CommandItem>
      </CommandGroup>
    )
  }

  return (
    <CommandGroup heading='Symbols'>
      {items.map((item, index) => (
        <CommandItem
          key={`${item.name}:${item.selectionRange.start.line}:${index}`}
          keywords={[item.name, item.containerName ?? '', symbolKindLabel(item.kind)]}
          value={`symbol:${item.name}:${index}`}
          onSelect={() => onSelect(item)}
        >
          <TextTIcon className='text-muted-foreground' />
          <span className='min-w-0 flex-1'>
            <span className='block truncate font-medium'>{item.name}</span>
            <span className='text-muted-foreground block truncate text-[11px]'>
              {symbolDescription(item)}
            </span>
          </span>
          <CommandShortcut>{item.selectionRange.start.line + 1}</CommandShortcut>
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

function CommandPaletteRow({
  disabled,
  item,
  onSelect,
}: {
  readonly disabled: boolean
  readonly item: CommandPaletteItem
  readonly onSelect: (command: PlatformCommandId) => void
}) {
  return (
    <CommandItem
      disabled={disabled}
      keywords={commandKeywords(item.spec)}
      value={item.spec.id}
      onSelect={() => onSelect(item.spec.id)}
    >
      <CommandCategoryIcon category={item.spec.category} />
      <span className='min-w-0 flex-1'>
        <span className='block truncate font-medium'>{item.spec.title}</span>
        <span
          className={cn(
            'block truncate text-[11px] text-muted-foreground',
            disabled && 'text-muted-foreground/70',
          )}
        >
          {item.spec.description ?? item.spec.id}
        </span>
      </span>
      {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
    </CommandItem>
  )
}

function FilePaletteRow({
  item,
  onSelect,
}: {
  readonly item: FilePaletteItem
  readonly onSelect: (path: string) => void
}) {
  return (
    <CommandItem
      keywords={[item.entry.name, item.entry.path, item.pathLabel]}
      value={fileItemValue(item)}
      onSelect={() => onSelect(item.entry.path)}
    >
      <FileIcon className='text-muted-foreground' />
      <span className='min-w-0 flex-1'>
        <span className='block truncate font-medium'>{item.entry.name}</span>
        <span className='text-muted-foreground block truncate text-[11px]'>{item.pathLabel}</span>
      </span>
    </CommandItem>
  )
}

function commandPaletteItems(
  specs: readonly CommandSpec[],
  bindings: readonly PlatformKeyBinding[],
): readonly CommandPaletteItem[] {
  return specs
    .filter((spec) => !hiddenCommandPaletteCommands.has(spec.id))
    .map((spec) => ({
      shortcut: commandShortcut(spec.id, bindings),
      spec,
    }))
}

function groupedCommandItems(
  items: readonly CommandPaletteItem[],
): readonly (readonly [string, readonly CommandPaletteItem[]])[] {
  const groups = new Map<string, CommandPaletteItem[]>()
  for (const item of items) {
    const group = groups.get(item.spec.category)
    if (group) {
      group.push(item)
      continue
    }

    groups.set(item.spec.category, [item])
  }

  return Array.from(groups.entries())
}

function filePaletteItems(state: LoadState<TreeModel>): readonly FilePaletteItem[] {
  if (state.status !== 'ready') return []

  return state.data.paths.flatMap((treePath) => {
    const entry = state.data.entriesByTreePath.get(treePath.replace(/\/$/, ''))
    if (!entry || !isFileEntry(entry)) return []

    return [{ entry, pathLabel: treePath }]
  })
}

function searchFilePaletteItems(
  matches: readonly {
    birthtimeMs?: number
    mtimeMs?: number
    path: string
    size?: number
    targetType?: TreeEntry['targetType']
    type: TreeEntry['type']
  }[],
  rootPath: string,
): readonly FilePaletteItem[] {
  return matches.map((match) => ({
    entry: {
      birthtimeMs: match.birthtimeMs ?? 0,
      mtimeMs: match.mtimeMs ?? 0,
      name: basename(match.path),
      path: match.path,
      size: match.size ?? 0,
      targetType: match.targetType,
      type: match.type,
    },
    pathLabel: toTreePath(match.path, rootPath),
  }))
}

function selectedFileCommandValue(selectedValue: string | null, items: readonly FilePaletteItem[]) {
  const firstValue = items[0] ? fileItemValue(items[0]) : undefined
  if (!selectedValue) return firstValue
  if (items.some((item) => fileItemValue(item) === selectedValue)) {
    return selectedValue
  }

  return firstValue
}

function fileItemValue(item: FilePaletteItem) {
  return `file:${item.entry.path}`
}

function editorPaletteItems(
  openFilePaths: readonly string[],
  selectedFilePath: string | null,
): readonly EditorPaletteItem[] {
  return openFilePaths.map((path) => ({
    active: path === selectedFilePath,
    name: basename(path),
    path,
    pathLabel: displayPath(path),
  }))
}

function commandShortcut(command: PlatformCommandId, bindings: readonly PlatformKeyBinding[]) {
  const binding = bindings.find((candidate) => candidate.command === command)
  if (!binding) return null
  if (typeof binding.hotkey === 'string') return formatHotkey(binding.hotkey)

  return formatHotkey(binding.keys)
}

function commandKeywords(spec: CommandSpec) {
  return [
    spec.title,
    spec.category,
    spec.description ?? '',
    spec.id,
    ...(spec.vscodeCommandIds ?? []),
  ]
}

function isCommandDisabled(
  command: PlatformCommandId,
  hasWorkspace: boolean,
  selectedFilePath: string | null,
) {
  if (workspaceOptionalCommands.has(command)) return false
  if (!hasWorkspace) return true
  if (selectedFileCommands.has(command)) return !fileBackedPath(selectedFilePath)
  if (isEditorPlatformCommandId(command)) return !fileBackedPath(selectedFilePath)

  return false
}

function fileBackedPath(path: string | null) {
  if (!path) return null
  if (parseSearchBufferDocumentId(path)) return null

  return path
}

function CommandCategoryIcon({ category }: { readonly category: string }) {
  if (category === 'Editor') {
    return <TextTIcon className='text-muted-foreground' />
  }
  if (category === 'Workspace') {
    return <TerminalWindowIcon className='text-muted-foreground' />
  }

  return <CommandIcon className='text-muted-foreground' />
}

function quickAccessMode(search: string) {
  if (search.startsWith('view ')) return 'views'
  if (search.startsWith('color ')) return 'colorMode'
  if (search.startsWith('edt ')) return 'editors'
  if (search.startsWith('@')) return 'symbols'
  return search.startsWith('>') ? 'commands' : 'files'
}

function quickAccessQuery(search: string) {
  if (search.startsWith('view ')) return search.slice(5).trimStart()
  if (search.startsWith('color ')) return search.slice(6).trimStart()
  if (search.startsWith('edt ')) return search.slice(4).trimStart()
  if (search.startsWith('@')) return search.slice(1).trimStart()
  if (!search.startsWith('>')) return search

  return search.slice(1).trimStart()
}

function quickAccessFilter(value: string, search: string, keywords?: readonly string[]) {
  const query = quickAccessQuery(search)
  if (!query) return 1

  return fuzzyRankScore(quickAccessRankTarget(value, keywords), query)
}

function quickAccessRankTarget(value: string, keywords: readonly string[] | undefined) {
  const label = keywords?.[0] ?? value
  const path = keywords?.[1] ?? value
  const extraKeywords = [value].concat(keywords?.slice(2) ?? [])

  return { label, keywords: extraKeywords, path }
}

function emptyLabelForMode(mode: ReturnType<typeof quickAccessMode>) {
  if (mode === 'commands') return 'No matching commands'
  if (mode === 'views') return 'No matching views'
  if (mode === 'colorMode') return 'No matching color modes'
  if (mode === 'editors') return 'No open editors'
  if (mode === 'symbols') return 'No matching symbols'

  return 'No matching files'
}

function placeholderForMode(mode: ReturnType<typeof quickAccessMode>) {
  if (mode === 'commands') return 'Search commands...'
  if (mode === 'views') return 'Search views...'
  if (mode === 'colorMode') return 'Choose color mode...'
  if (mode === 'editors') return 'Search open editors...'
  if (mode === 'symbols') return 'Search symbols in the active editor...'

  return 'Search files or type > for commands...'
}

function commandKeepsPaletteOpen(command: PlatformCommandId) {
  return paletteModeCommands.has(command)
}

function symbolDescription(symbol: FlatDocumentSymbol) {
  const kind = symbolKindLabel(symbol.kind)
  if (!symbol.containerName) return kind

  return `${kind} in ${symbol.containerName}`
}

function symbolKindLabel(kind: number) {
  if (kind === 5) return 'Class'
  if (kind === 6) return 'Method'
  if (kind === 7) return 'Property'
  if (kind === 10) return 'Enum'
  if (kind === 11) return 'Interface'
  if (kind === 12) return 'Function'
  if (kind === 13) return 'Variable'

  return 'Symbol'
}

function fileUriForPath(path: string) {
  const normalized = path.replace(/^\/+/, '')
  return `file:///${normalized.split('/').map(encodeURIComponent).join('/')}`
}

function formatHotkey(hotkey: string) {
  const isMac = isMacPlatform()
  const separator = isMac ? '' : '+'

  return hotkey
    .split('+')
    .map((token) => hotkeyTokenLabel(token, isMac))
    .join(separator)
}

function hotkeyTokenLabel(token: string, isMac: boolean) {
  const normalized = token.toLowerCase()
  if (normalized === 'mod') return isMac ? '⌘' : 'Ctrl'
  if (normalized === 'meta') return isMac ? '⌘' : 'Meta'
  if (normalized === 'cmd') return isMac ? '⌘' : 'Cmd'
  if (normalized === 'ctrl') return isMac ? '⌃' : 'Ctrl'
  if (normalized === 'shift') return isMac ? '⇧' : 'Shift'
  if (normalized === 'alt') return isMac ? '⌥' : 'Alt'
  if (normalized === 'enter') return '↵'
  if (normalized === 'escape') return 'Esc'
  if (normalized.length === 1) return normalized.toUpperCase()

  return token
}

function isMacPlatform() {
  if (typeof navigator === 'undefined') return false

  return /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}
