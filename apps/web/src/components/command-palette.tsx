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
import { useEditorWorkspaceState } from "@/features/editor/state/editor-workspace-state"
import { isFileEntry, type TreeEntry } from "@/lib/file-system-types"
import type { LoadState } from "@/lib/load-state"
import type { TreeModel } from "@/lib/tree-model"
import {
  isEditorPlatformCommandId,
  platformCommandSpecs,
  type CommandSpec,
  type PlatformCommandDispatch,
  type PlatformCommandId,
  type PlatformKeyBinding,
} from "@/keymap"

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
  const selectedFilePath = useEditorWorkspaceState(
    (state) => state.selectedFilePath
  )
  const { selectFile } = useEditorCommands()
  const mode = quickAccessMode(search)
  const items = useMemo(
    () => commandPaletteItems(platformCommandSpecs, bindings),
    [bindings]
  )
  const groups = useMemo(() => groupedCommandItems(items), [items])
  const fileItems = useMemo(() => filePaletteItems(treeState), [treeState])
  const runCommand = useCallback(
    (command: PlatformCommandId) => {
      if (isCommandDisabled(command, hasWorkspace, selectedFilePath)) return

      const handled = dispatch(command)
      if (handled === false) return

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

  return (
    <CommandDialog
      commandProps={{ filter: quickAccessFilter, loop: true }}
      open={open}
      onOpenChange={onOpenChange}
    >
      <CommandInput
        placeholder="Search files or type > to run commands..."
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
        ) : (
          <QuickOpenGroups
            files={fileItems}
            hasWorkspace={hasWorkspace}
            onCommandSelect={runCommand}
            onFileSelect={openFile}
            onShowCommands={() => onSearchChange(">")}
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
  onShowCommands,
}: {
  readonly files: readonly FilePaletteItem[]
  readonly hasWorkspace: boolean
  readonly onCommandSelect: (command: PlatformCommandId) => void
  readonly onFileSelect: (path: string) => void
  readonly onShowCommands: () => void
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
  return specs.map((spec) => ({
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
  if (command === "workspace.closeCurrentTab") return !selectedFilePath
  if (isEditorPlatformCommandId(command)) return !selectedFilePath

  return false
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
  return search.startsWith(">") ? "commands" : "files"
}

function quickAccessQuery(search: string) {
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

  return "No matching files or quick actions"
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
