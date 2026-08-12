import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { useWorkspaceTreeState } from '@/hooks/use-workspace-tree'
import { platformCommandSpecs } from '@/keymap/command-registry'
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandList,
} from '@workspace/ui/components/command'
import { cn } from '@workspace/ui/lib/utils'

import { CommandPaletteGroupsFactory } from '@/components/command-palette/command-palette-groups-factory'
import { useCommandPaletteScripts } from '@/components/command-palette/use-command-palette-scripts'
import { useTerminalCommandInboxStore } from '@/features/terminal/state/command-inbox-store'
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
  isColorPreviewMode,
  isCommandDisabled,
  placeholderForMode,
  quickAccessFilter,
  quickAccessMode,
  quickAccessQuery,
} from '@/components/command-palette/command-palette-utils'
import { useCommandPaletteFiles } from '@/components/command-palette/use-command-palette-files'
import { useCommandPaletteSessions } from '@/components/command-palette/use-command-palette-sessions'
import { useCommandPaletteSymbols } from '@/components/command-palette/use-command-palette-symbols'
import { openSessionRow, startSessionDraft } from '@/features/chat-mode/state/session-commands'
import {
  clearEditorThemePreview,
  previewEditorTheme,
  setSelectedEditorThemeId,
} from '@/features/editor/state/editor-color-theme-store'
import { useOpenWorkspaceRoot } from '@/hooks/use-open-workspace-root'
import {
  CommandPaletteActionsContext,
  type CommandPaletteActions,
} from '@/components/command-palette/providers/actions-context'
import { useTheme } from '@/components/theme-context'
import { useEffect, useMemo } from 'react'

export function CommandPaletteContent({
  bindings,
  dispatch,
  onOpenChange,
  onSearchChange,
  open,
  search,
}: CommandPaletteProps) {
  const { resolvedTheme, theme } = useTheme()
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
  const { projects: sessionProjects, sessions: sessionItems } = useCommandPaletteSessions()
  const queueTerminalCommand = useTerminalCommandInboxStore((state) => state.queueCommand)
  const scriptItems = useCommandPaletteScripts({
    enabled: open && mode === 'scripts',
    rootPath: rootFolder?.path ?? null,
  })
  // Chat mode registers the project opener only while it is mounted, and the palette
  // can open a session from the workbench — so it brings its own.
  const openWorkspaceRoot = useOpenWorkspaceRoot()
  const commandItems = commandPaletteItems(platformCommandSpecs, bindings)
  const groups = groupedCommandItems(commandItems, search)

  // Cancel any hover-preview when the palette closes without a selection; the
  // commit path in `selectColorTheme` clears the preview itself.
  useEffect(() => {
    if (open) return
    clearEditorThemePreview()
  }, [open])

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

  // Stable action identity keeps palette rows from repainting on root input state updates.
  const actions = useMemo<CommandPaletteActions>(
    () => ({
      previewPlatformCommand: (command) => {
        if (isCommandDisabled(command, { activeFilePath, hasWorkspace })) return

        dispatch(command)
      },
      previewColorTheme: (themeId) => {
        previewEditorTheme(resolvedTheme, themeId)
      },
      selectColorTheme: (themeId) => {
        setSelectedEditorThemeId(resolvedTheme, themeId)
        onOpenChange(false)
      },
      selectCommand: (item) => {
        const disabledReason = commandPaletteItemDisabledReason(item, {
          activeFilePath,
          hasWorkspace,
        })
        if (disabledReason) return

        const handled = dispatch(item.command.command)
        if (handled === false) return
        if (commandPaletteItemKeepsOpen(item)) return

        onOpenChange(false)
      },
      selectFile: (path) => {
        selectFile(path)
        onOpenChange(false)
      },
      selectPlatformCommand: (command) => {
        if (isCommandDisabled(command, { activeFilePath, hasWorkspace })) return

        const handled = dispatch(command)
        if (handled === false) return
        if (commandKeepsPaletteOpen(command)) return

        onOpenChange(false)
      },
      selectScript: (script) => {
        // The terminal is the surface that can actually run it; the inbox is what
        // lets the pick land before one exists. Revealing the panel is what turns
        // a queued command into a visible one.
        queueTerminalCommand(script.command)
        dispatch('workspace.revealTerminal')
        onOpenChange(false)
      },
      selectSession: (session) => {
        // Chat mode first: the stage that will show this session has to exist before
        // the pick lands, or the user is left staring at the editor.
        dispatch('workspace.showChatMode')
        openSessionRow(session, { openProject: openWorkspaceRoot })
        onOpenChange(false)
      },
      selectGotoLine: (target) => {
        if (!selectedFileBackedPath) return

        // The editor takes zero-based positions; the palette takes the numbers shown in the
        // gutter, so the conversion happens here, at the boundary between them.
        const position = { character: target.column - 1, line: target.line - 1 }
        const handled = openDefinition({
          path: selectedFileBackedPath,
          range: { end: position, start: position },
          uri: fileUriForPath(selectedFileBackedPath),
        })
        if (handled === false) return

        onOpenChange(false)
      },
      selectSymbol: (symbol) => {
        if (!selectedFileBackedPath) return

        const handled = openDefinition({
          path: selectedFileBackedPath,
          range: symbol.selectionRange,
          uri: fileUriForPath(selectedFileBackedPath),
        })
        if (handled === false) return

        onOpenChange(false)
      },
      startSessionDraft: (projectId) => {
        dispatch('workspace.showChatMode')
        startSessionDraft(projectId, { openProject: openWorkspaceRoot })
        onOpenChange(false)
      },
    }),
    [
      activeFilePath,
      dispatch,
      hasWorkspace,
      onOpenChange,
      openDefinition,
      openWorkspaceRoot,
      queueTerminalCommand,
      resolvedTheme,
      selectFile,
      selectedFileBackedPath,
    ],
  )

  const colorPreview = isColorPreviewMode(mode)

  return (
    <CommandDialog
      // Picking a color is the one mode where the palette is not the thing being
      // looked at — the editor behind it is. So it pulls up, narrows, and stops
      // frosting the overlay, leaving as much live-previewed code on screen as a
      // centered dialog can.
      className={colorPreview ? 'top-[6vh] sm:max-w-[420px]' : undefined}
      commandProps={{
        filter: quickAccessFilter,
        loop: true,
        onValueChange: handleCommandValueChange,
        shouldFilter: mode !== 'files',
        value: selectedCommandValue,
      }}
      overlayClassName={colorPreview ? 'supports-backdrop-filter:backdrop-blur-none' : undefined}
      open={open}
      onOpenChange={onOpenChange}
    >
      <CommandInput
        placeholder={placeholderForMode(mode)}
        value={search}
        onValueChange={handleSearchChange}
      />
      <CommandList
        className={cn('py-1', colorPreview ? 'max-h-[min(38vh,300px)]' : 'max-h-[min(58vh,440px)]')}
      >
        <CommandEmpty>{emptyLabelForMode(mode)}</CommandEmpty>
        <CommandPaletteActionsContext value={actions}>
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
            scriptItems={scriptItems}
            sessionItems={sessionItems}
            sessionProjects={sessionProjects}
            symbolItems={symbolQuery.data ?? []}
            symbolsPending={symbolsEnabled && symbolQuery.isPending}
          />
        </CommandPaletteActionsContext>
      </CommandList>
    </CommandDialog>
  )
}

function commandPaletteItemKeepsOpen(item: CommandPaletteItem) {
  if (item.command.kind !== 'platform') return false

  return commandKeepsPaletteOpen(item.command.command)
}
