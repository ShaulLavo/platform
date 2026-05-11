import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@workspace/ui/components/command"
import { cn } from "@workspace/ui/lib/utils"
import {
  CommandIcon,
  FileIcon,
  TerminalWindowIcon,
  TextTIcon,
} from "@phosphor-icons/react"
import { useCallback, useMemo } from "react"

import { useEditorCommands } from "@/features/editor/state/editor-commands"
import { useEditorDocumentState } from "@/features/editor/state/editor-document-state"
import { useEditorWorkspaceState } from "@/features/editor/state/editor-workspace-state"
import { parseSearchBufferDocumentId } from "@/features/search/search-buffer-document"
import {
  fetchDocumentSymbols,
  type FlatDocumentSymbol,
} from "@/lib/document-symbols"
import { isFileEntry, type TreeEntry } from "@/lib/file-system-types"
import type { LoadState } from "@/lib/load-state"
import { basename, displayPath } from "@/lib/path-formatters"
import type { TreeModel } from "@/lib/tree-model"
import {
  isEditorPlatformCommandId,
  platformCommandSpecs,
  type CommandSpec,
  type PlatformCommandDispatch,
  type PlatformCommandId,
  type PlatformKeyBinding,
} from "@/keymap"
import { useQuery } from "@tanstack/react-query"

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

type EditorPaletteItem = {
  readonly active: boolean
  readonly name: string
  readonly path: string
  readonly pathLabel: string
}

const paletteModeCommands = new Set<PlatformCommandId>([
  "workspace.gotoSymbol",
  "workspace.quickOpenView",
  "workspace.showAllEditors",
  "workspace.showCommandPalette",
  "workspace.showQuickAccess",
])

const selectedFileCommands = new Set<PlatformCommandId>([
  "workspace.closeCurrentTab",
  "workspace.gotoSymbol",
  "workspace.revertFile",
  "workspace.saveFile",
])

const hiddenCommandPaletteCommands = new Set<PlatformCommandId>([
  "workspace.showCommandPalette",
])

const viewPaletteItems: readonly ViewPaletteItem[] = [
  {
    command: "workspace.focusFileTree",
    description: "Focus the workspace file explorer.",
    title: "Explorer",
    value: "view:explorer",
  },
  {
    command: "workspace.focusGit",
    description: "Focus source control.",
    title: "Source Control",
    value: "view:source-control",
  },
  {
    command: "workspace.focusEditor",
    description: "Focus the active editor.",
    title: "Editor",
    value: "view:editor",
  },
  {
    command: "workspace.openFilePicker",
    description: "Choose a workspace folder.",
    title: "Open Folder",
    value: "view:open-folder",
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
  const hasWorkspace = useEditorWorkspaceState((state) => !!state.rootFolder)
  const rootFolder = useEditorWorkspaceState((state) => state.rootFolder)
  const openFilePaths = useEditorWorkspaceState((state) => state.openFilePaths)
  const selectedFilePath = useEditorWorkspaceState(
    (state) => state.selectedFilePath
  )
  const documents = useEditorDocumentState((state) => state.documents)
  const selectedDocument = selectedFilePath ? documents[selectedFilePath] : null
  const selectedDocumentText = selectedDocument?.session.getText() ?? null
  const { openDefinition, selectFile } = useEditorCommands()
  const mode = quickAccessMode(search)
  const items = useMemo(
    () => commandPaletteItems(platformCommandSpecs, bindings),
    [bindings]
  )
  const groups = useMemo(() => groupedCommandItems(items), [items])
  const fileItems = useMemo(() => filePaletteItems(treeState), [treeState])
  const editorItems = useMemo(
    () => editorPaletteItems(openFilePaths, selectedFilePath),
    [openFilePaths, selectedFilePath]
  )
  const selectedFileBackedPath = fileBackedPath(selectedFilePath)
  const symbolsEnabled =
    mode === "symbols" && Boolean(rootFolder && selectedFileBackedPath)
  const symbolQuery = useQuery({
    enabled: symbolsEnabled,
    queryFn: ({ signal }) =>
      fetchDocumentSymbols({
        path: selectedFileBackedPath ?? "",
        rootPath: rootFolder?.path ?? "",
        signal,
        text: selectedDocumentText,
      }),
    queryKey: [
      "document-symbols",
      rootFolder?.path ?? "",
      selectedFileBackedPath ?? "",
      selectedDocumentText ?? "",
    ],
  })
  const runCommand = useCallback(
    (command: PlatformCommandId) => {
      if (isCommandDisabled(command, hasWorkspace, selectedFilePath)) return

      const handled = dispatch(command)
      if (handled === false) return
      if (commandKeepsPaletteOpen(command)) return

      onOpenChange(false)
    },
    [dispatch, hasWorkspace, onOpenChange, selectedFilePath]
  )
  const openFile = useCallback(
    (path: string) => {
      selectFile(path)
      onOpenChange(false)
    },
    [onOpenChange, selectFile]
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
    [onOpenChange, openDefinition, selectedFilePath]
  )

  return (
    <CommandDialog
      commandProps={{ filter: quickAccessFilter, loop: true }}
      open={open}
      onOpenChange={onOpenChange}
    >
      <CommandInput
        placeholder={placeholderForMode(mode)}
        value={search}
        onValueChange={onSearchChange}
      />
      <CommandList>
        <CommandEmpty>{emptyLabelForMode(mode)}</CommandEmpty>
        {mode === "commands" ? (
          <CommandGroups
            groups={groups}
            hasWorkspace={hasWorkspace}
            selectedFilePath={selectedFilePath}
            onSelect={runCommand}
          />
        ) : mode === "views" ? (
          <ViewGroups hasWorkspace={hasWorkspace} onSelect={runCommand} />
        ) : mode === "editors" ? (
          <EditorGroups items={editorItems} onSelect={openFile} />
        ) : mode === "symbols" ? (
          <SymbolGroups
            isPending={symbolsEnabled && symbolQuery.isPending}
            items={symbolQuery.data ?? []}
            onSelect={openSymbol}
          />
        ) : (
          <QuickOpenGroups
            files={fileItems}
            hasWorkspace={hasWorkspace}
            onCommandSelect={runCommand}
            onFileSelect={openFile}
            onShowEditors={() => onSearchChange("edt ")}
            onShowSymbols={() => onSearchChange("@")}
            onShowCommands={() => onSearchChange(">")}
            onShowViews={() => onSearchChange("view ")}
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
              disabled={isCommandDisabled(
                item.spec.id,
                hasWorkspace,
                selectedFilePath
              )}
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
  onCommandSelect,
  onFileSelect,
  onShowEditors,
  onShowSymbols,
  onShowCommands,
  onShowViews,
}: {
  readonly files: readonly FilePaletteItem[]
  readonly hasWorkspace: boolean
  readonly onCommandSelect: (command: PlatformCommandId) => void
  readonly onFileSelect: (path: string) => void
  readonly onShowEditors: () => void
  readonly onShowSymbols: () => void
  readonly onShowCommands: () => void
  readonly onShowViews: () => void
}) {
  return (
    <>
      <CommandGroup heading="Quick Access">
        <QuickActionItem
          description="Search and run commands."
          shortcut=">"
          title="Show and Run Commands"
          value="quick-action:commands"
          onSelect={onShowCommands}
        />
        <QuickActionItem
          description="Search workspace views."
          shortcut="view"
          title="Open View"
          value="quick-action:views"
          onSelect={onShowViews}
        />
        <QuickActionItem
          description="Search open editor tabs."
          shortcut="edt"
          title="Show All Editors"
          value="quick-action:editors"
          onSelect={onShowEditors}
        />
        <QuickActionItem
          description="Search symbols in the active editor."
          shortcut="@"
          title="Go to Symbol in Editor"
          value="quick-action:symbols"
          onSelect={onShowSymbols}
        />
        <QuickActionItem
          description="Choose a workspace folder."
          title="Open file picker"
          value="quick-action:open-file-picker"
          onSelect={() => onCommandSelect("workspace.openFilePicker")}
        />
      </CommandGroup>
      {hasWorkspace && files.length > 0 && (
        <CommandGroup heading="Files">
          {files.map((item) => (
            <FilePaletteRow
              item={item}
              key={item.entry.path}
              onSelect={onFileSelect}
            />
          ))}
        </CommandGroup>
      )}
    </>
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
    <CommandGroup heading="Views">
      {viewPaletteItems.map((item) => (
        <CommandItem
          disabled={
            !hasWorkspace && item.command !== "workspace.openFilePicker"
          }
          key={item.value}
          keywords={[item.title, item.description, item.command]}
          value={item.value}
          onSelect={() => onSelect(item.command)}
        >
          <TerminalWindowIcon className="text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{item.title}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
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
    <CommandGroup heading="Open Editors">
      {items.map((item) => (
        <CommandItem
          key={item.path}
          keywords={[item.name, item.path, item.pathLabel]}
          value={`editor:${item.path}`}
          onSelect={() => onSelect(item.path)}
        >
          <FileIcon className="text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{item.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
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
      <CommandGroup heading="Symbols">
        <CommandItem disabled value="symbols:loading">
          <TextTIcon className="text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading symbols</span>
        </CommandItem>
      </CommandGroup>
    )
  }

  return (
    <CommandGroup heading="Symbols">
      {items.map((item, index) => (
        <CommandItem
          key={`${item.name}:${item.selectionRange.start.line}:${index}`}
          keywords={[
            item.name,
            item.containerName ?? "",
            symbolKindLabel(item.kind),
          ]}
          value={`symbol:${item.name}:${index}`}
          onSelect={() => onSelect(item)}
        >
          <TextTIcon className="text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{item.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {symbolDescription(item)}
            </span>
          </span>
          <CommandShortcut>
            {item.selectionRange.start.line + 1}
          </CommandShortcut>
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
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.spec.title}</span>
        <span
          className={cn(
            "block truncate text-[11px] text-muted-foreground",
            disabled && "text-muted-foreground/70"
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
      value={`file:${item.entry.path}`}
      onSelect={() => onSelect(item.entry.path)}
    >
      <FileIcon className="text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.entry.name}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {item.pathLabel}
        </span>
      </span>
    </CommandItem>
  )
}

function QuickActionItem({
  description,
  shortcut,
  title,
  value,
  onSelect,
}: {
  readonly description: string
  readonly shortcut?: string
  readonly title: string
  readonly value: string
  readonly onSelect: () => void
}) {
  return (
    <CommandItem
      keywords={[title, description, value]}
      value={value}
      onSelect={onSelect}
    >
      <TerminalWindowIcon className="text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {description}
        </span>
      </span>
      {shortcut && <CommandShortcut>{shortcut}</CommandShortcut>}
    </CommandItem>
  )
}

function commandPaletteItems(
  specs: readonly CommandSpec[],
  bindings: readonly PlatformKeyBinding[]
): readonly CommandPaletteItem[] {
  return specs
    .filter((spec) => !hiddenCommandPaletteCommands.has(spec.id))
    .map((spec) => ({
      shortcut: commandShortcut(spec.id, bindings),
      spec,
    }))
}

function groupedCommandItems(
  items: readonly CommandPaletteItem[]
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

  return [...groups.entries()]
}

function filePaletteItems(
  state: LoadState<TreeModel>
): readonly FilePaletteItem[] {
  if (state.status !== "ready") return []

  return state.data.paths.flatMap((treePath) => {
    const entry = state.data.entriesByTreePath.get(treePath.replace(/\/$/, ""))
    if (!entry || !isFileEntry(entry)) return []

    return [{ entry, pathLabel: treePath }]
  })
}

function editorPaletteItems(
  openFilePaths: readonly string[],
  selectedFilePath: string | null
): readonly EditorPaletteItem[] {
  return openFilePaths.map((path) => ({
    active: path === selectedFilePath,
    name: basename(path),
    path,
    pathLabel: displayPath(path),
  }))
}

function commandShortcut(
  command: PlatformCommandId,
  bindings: readonly PlatformKeyBinding[]
) {
  const binding = bindings.find((candidate) => candidate.command === command)
  if (!binding) return null
  if (typeof binding.hotkey === "string") return formatHotkey(binding.hotkey)

  return formatHotkey(binding.keys)
}

function commandKeywords(spec: CommandSpec) {
  return [
    spec.title,
    spec.category,
    spec.description ?? "",
    spec.id,
    ...(spec.vscodeCommandIds ?? []),
  ]
}

function isCommandDisabled(
  command: PlatformCommandId,
  hasWorkspace: boolean,
  selectedFilePath: string | null
) {
  if (command === "workspace.showCommandPalette") return false
  if (command === "workspace.openFilePicker") return false
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
  if (category === "Editor") {
    return <TextTIcon className="text-muted-foreground" />
  }
  if (category === "Workspace") {
    return <TerminalWindowIcon className="text-muted-foreground" />
  }

  return <CommandIcon className="text-muted-foreground" />
}

function quickAccessMode(search: string) {
  if (search.startsWith("view ")) return "views"
  if (search.startsWith("edt ")) return "editors"
  if (search.startsWith("@")) return "symbols"
  return search.startsWith(">") ? "commands" : "files"
}

function quickAccessQuery(search: string) {
  if (search.startsWith("view ")) return search.slice(5).trimStart()
  if (search.startsWith("edt ")) return search.slice(4).trimStart()
  if (search.startsWith("@")) return search.slice(1).trimStart()
  if (!search.startsWith(">")) return search

  return search.slice(1).trimStart()
}

function quickAccessFilter(
  value: string,
  search: string,
  keywords?: readonly string[]
) {
  const query = quickAccessQuery(search).toLowerCase()
  if (!query) return 1

  const haystack = [value, ...(keywords ?? [])].join(" ").toLowerCase()
  if (haystack.includes(query)) return 1

  return fuzzyIncludes(haystack, query) ? 0.5 : 0
}

function fuzzyIncludes(value: string, query: string) {
  let queryIndex = 0
  for (const character of value) {
    if (character !== query[queryIndex]) continue

    queryIndex += 1
    if (queryIndex === query.length) return true
  }

  return false
}

function emptyLabelForMode(mode: ReturnType<typeof quickAccessMode>) {
  if (mode === "commands") return "No matching commands"
  if (mode === "views") return "No matching views"
  if (mode === "editors") return "No open editors"
  if (mode === "symbols") return "No matching symbols"

  return "No matching files or quick actions"
}

function placeholderForMode(mode: ReturnType<typeof quickAccessMode>) {
  if (mode === "commands") return "Search commands..."
  if (mode === "views") return "Search views..."
  if (mode === "editors") return "Search open editors..."
  if (mode === "symbols") return "Search symbols in the active editor..."

  return "Search files or type > to run commands..."
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
  if (kind === 5) return "Class"
  if (kind === 6) return "Method"
  if (kind === 7) return "Property"
  if (kind === 10) return "Enum"
  if (kind === 11) return "Interface"
  if (kind === 12) return "Function"
  if (kind === 13) return "Variable"

  return "Symbol"
}

function fileUriForPath(path: string) {
  const normalized = path.replace(/^\/+/, "")
  return `file:///${normalized.split("/").map(encodeURIComponent).join("/")}`
}

function formatHotkey(hotkey: string) {
  const isMac = isMacPlatform()
  const separator = isMac ? "" : "+"

  return hotkey
    .split("+")
    .map((token) => hotkeyTokenLabel(token, isMac))
    .join(separator)
}

function hotkeyTokenLabel(token: string, isMac: boolean) {
  const normalized = token.toLowerCase()
  if (normalized === "mod") return isMac ? "⌘" : "Ctrl"
  if (normalized === "meta") return isMac ? "⌘" : "Meta"
  if (normalized === "cmd") return isMac ? "⌘" : "Cmd"
  if (normalized === "ctrl") return isMac ? "⌃" : "Ctrl"
  if (normalized === "shift") return isMac ? "⇧" : "Shift"
  if (normalized === "alt") return isMac ? "⌥" : "Alt"
  if (normalized === "enter") return "↵"
  if (normalized === "escape") return "Esc"
  if (normalized.length === 1) return normalized.toUpperCase()

  return token
}

function isMacPlatform() {
  if (typeof navigator === "undefined") return false

  return /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}
