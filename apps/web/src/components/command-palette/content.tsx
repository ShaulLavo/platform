import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { useWorkspaceTreeState } from '@/hooks/use-workspace-tree'
import type { FlatDocumentSymbol } from '@/lib/document-symbols'
import { platformCommandSpecs } from '@/keymap/command-registry'
import type { PlatformCommandId } from '@/keymap/types'
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandList,
} from '@workspace/ui/components/command'

import { CommandPaletteGroupsFactory } from '@/components/command-palette/command-palette-groups-factory'
import type {
  CommandPaletteItem,
  CommandPaletteProps,
} from '@/components/command-palette/command-palette-types'
import {
  commandKeepsPaletteOpen,
  commandPaletteItemDisabledReason,
  commandPaletteItems,
  editorPaletteItems,
  emptyLabelForMode,
  fileUriForPath,
  groupedCommandItems,
  isCommandDisabled,
  placeholderForMode,
  quickAccessFilter,
  quickAccessMode,
  quickAccessQuery,
} from '@/components/command-palette/command-palette-utils'
import { useCommandPaletteFiles } from '@/components/command-palette/use-command-palette-files'
import { useCommandPaletteSymbols } from '@/components/command-palette/use-command-palette-symbols'
import { useTheme } from '@/components/theme-context'

export function CommandPaletteContent({
  bindings,
  dispatch,
  onOpenChange,
  onSearchChange,
  open,
  search,
}: CommandPaletteProps) {
  const { theme } = useTheme()
  const hasWorkspace = useEditorWorkspaceState((state) => Boolean(state.rootFolder))
  const rootFolder = useEditorWorkspaceState((state) => state.rootFolder)
  const openFilePaths = useEditorWorkspaceState((state) => state.openFilePaths)
  const selectedFilePath = useEditorWorkspaceState((state) => state.selectedFilePath)
  const activeFilePath = selectedFilePath
  const { openDefinition, selectFile } = useEditorCommands()
  const mode = quickAccessMode(search)
  const query = quickAccessQuery(search)
  const treeState = useWorkspaceTreeState(rootFolder)
  const editorItems = editorPaletteItems(openFilePaths, selectedFilePath)
  const {
    fileQuery,
    fileSearchQuery,
    selectedCommandValue,
    setSelectedFileItemValue,
    visibleFileItems,
  } = useCommandPaletteFiles({
    mode,
    open,
    query,
    rootPath: rootFolder?.path ?? null,
    treeState,
  })
  const { selectedFileBackedPath, symbolQuery, symbolsEnabled } = useCommandPaletteSymbols({
    mode,
    rootPath: rootFolder?.path ?? null,
    selectedFilePath: activeFilePath,
  })
  const commandItems = commandPaletteItems(platformCommandSpecs, bindings)
  const groups = groupedCommandItems(commandItems, search)

  function runCommand(item: CommandPaletteItem) {
    const disabledReason = commandPaletteItemDisabledReason(item, {
      activeFilePath,
      hasWorkspace,
    })
    if (disabledReason) return

    const handled = dispatchPlatformPaletteSelection(item)
    if (handled === false) return
    if (commandPaletteItemKeepsOpen(item)) return

    onOpenChange(false)
  }

  function runPlatformCommand(command: PlatformCommandId) {
    if (isCommandDisabled(command, { activeFilePath, hasWorkspace })) return

    const handled = dispatch(command)
    if (handled === false) return
    if (commandKeepsPaletteOpen(command)) return

    onOpenChange(false)
  }

  function previewPlatformCommand(command: PlatformCommandId) {
    if (isCommandDisabled(command, { activeFilePath, hasWorkspace })) return

    dispatch(command)
  }

  function dispatchPlatformPaletteSelection(item: CommandPaletteItem) {
    return dispatch(item.command.command)
  }

  function handleCommandValueChange(value: string) {
    if (mode !== 'files') return

    setSelectedFileItemValue(value)
  }

  function handleSearchChange(value: string) {
    if (quickAccessMode(value) === 'files') {
      setSelectedFileItemValue(null)
    }

    onSearchChange(value)
  }

  function openFile(path: string) {
    selectFile(path)
    onOpenChange(false)
  }

  function openSymbol(symbol: FlatDocumentSymbol) {
    if (!selectedFileBackedPath) return

    const handled = openDefinition({
      path: selectedFileBackedPath,
      range: symbol.selectionRange,
      uri: fileUriForPath(selectedFileBackedPath),
    })
    if (handled === false) return

    onOpenChange(false)
  }

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
      <CommandList className='max-h-[min(58vh,440px)] py-1'>
        <CommandEmpty>{emptyLabelForMode(mode)}</CommandEmpty>
        <CommandPaletteGroupsFactory
          commandGroups={groups}
          currentTheme={theme}
          editorItems={editorItems}
          fileItems={visibleFileItems}
          fileQuery={fileQuery}
          fileSearchError={fileSearchQuery.isError}
          hasWorkspace={hasWorkspace}
          activeFilePath={activeFilePath}
          mode={mode}
          symbolItems={symbolQuery.data ?? []}
          symbolsPending={symbolsEnabled && symbolQuery.isPending}
          onCommandSelect={runCommand}
          onFileSelect={openFile}
          onPlatformCommandPreview={previewPlatformCommand}
          onPlatformCommandSelect={runPlatformCommand}
          onSymbolSelect={openSymbol}
        />
      </CommandList>
    </CommandDialog>
  )
}

function commandPaletteItemKeepsOpen(item: CommandPaletteItem) {
  if (item.command.kind !== 'platform') return false

  return commandKeepsPaletteOpen(item.command.command)
}
