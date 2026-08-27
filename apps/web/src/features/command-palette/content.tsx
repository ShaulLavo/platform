import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandList,
} from '@workspace/ui/components/command'
import { useEffect, useMemo, type KeyboardEvent } from 'react'

import { CommandPaletteGroupsFactory } from '@/features/command-palette/command-palette-groups-factory'
import {
  activeEditorFocusDestination,
  colorThemeIdFromItemValue,
  commandKeepsPaletteOpen,
  commandPaletteItems,
  editorPaletteItems,
  emptyLabelForMode,
  fileUriForPath,
  focusTransitionAcknowledged,
  groupedCommandItems,
  isColorPreviewMode,
  paletteCommandInvocation,
  paletteCommandSucceeded,
  paletteOwnsItemOrder,
  placeholderForMode,
  previewColorModeItem,
  quickAccessFilter,
  quickAccessMode,
  quickAccessQuery,
  scopeLabelForMode,
  scopedPaletteFilter,
  workspaceRootOpened,
} from '@/features/command-palette/command-palette-utils'
import { ScopeChip } from '@/features/command-palette/scope-chip'
import { useHighlightedPaletteValue } from '@/features/command-palette/hooks/use-highlighted-palette-value'
import { useRecentCommandIds } from '@/features/command-palette/hooks/use-recent-command-ids'
import {
  CommandPaletteActionsContext,
  type CommandPaletteActions,
} from '@/features/command-palette/providers/actions-context'
import { recordCommandUse } from '@/features/command-palette/state/recent-commands-store'
import { useCommandPaletteFiles } from '@/features/command-palette/use-command-palette-files'
import { useCommandPaletteScripts } from '@/features/command-palette/use-command-palette-scripts'
import { useCommandPaletteSessions } from '@/features/command-palette/use-command-palette-sessions'
import { useCommandPaletteSymbols } from '@/features/command-palette/use-command-palette-symbols'
import { useSaveProjectScript } from '@/features/chat-mode/hooks/use-save-project-script'
import { openSessionRow, startSessionDraft } from '@/features/chat-mode/state/session-commands'
import { showChatModeToolTab } from '@/features/chat-mode/utils/panels'
import {
  clearEditorThemePreview,
  previewEditorTheme,
  setSelectedEditorThemeId,
} from '@/features/editor/state/color-theme-store'
import { useEditorCommands } from '@/features/editor/state/commands'
import {
  useEditorWorkspaceState,
  useEditorWorkspaceStoreApi,
} from '@/features/editor/state/workspace-state'
import { useTheme } from '@/features/settings/hooks/use-theme'
import { useTerminalCommandInboxStore } from '@/features/terminal/state/command-inbox-store'
import { useWorkspaceTreeState } from '@/features/workspace/hooks/use-tree'
import { useCommand } from '@/keymap/hooks/use-command'
import { platformCommandSpecs } from '@/keymap/command-registry'
import { useFocusService } from '@/lib/focus/hooks/use-service'
import { useFocusTarget } from '@/lib/focus/hooks/use-target'

export function CommandPaletteContent() {
  const {
    bindings,
    bus,
    closePalette,
    openWorkspaceRoot,
    paletteOpen: open,
    paletteOrigin,
    paletteScope,
    paletteSearch: search,
    popPaletteScope,
    setPaletteOpen,
    setPaletteSearch,
  } = useCommand()
  const focus = useFocusService()
  const workspace = useEditorWorkspaceStoreApi()
  const { clearThemePreview, previewTheme, resolvedTheme, theme } = useTheme()
  const hasWorkspace = useEditorWorkspaceState((state) => Boolean(state.rootFolder))
  const rootFolder = useEditorWorkspaceState((state) => state.rootFolder)
  const openFilePaths = useEditorWorkspaceState((state) => state.openFilePaths)
  const selectedFilePath = useEditorWorkspaceState((state) => state.selectedFilePath)
  const { openDefinition, selectFile } = useEditorCommands()
  // A scope holds the mode outside the input, so the input is the bare query.
  const mode = paletteScope?.mode ?? quickAccessMode(search)
  const query = paletteScope ? search : quickAccessQuery(search)
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
    selectedFilePath,
  })
  const { projects: sessionProjects, sessions: sessionItems } = useCommandPaletteSessions()
  const queueTerminalCommand = useTerminalCommandInboxStore((state) => state.queueCommand)
  const saveProjectScript = useSaveProjectScript()
  const scriptItems = useCommandPaletteScripts({
    enabled: open && mode === 'scripts',
    rootPath: rootFolder?.path ?? null,
  })
  const commandItems = commandPaletteItems(platformCommandSpecs, bindings)
  const recentCommandIds = useRecentCommandIds()
  const groups = groupedCommandItems(commandItems, search, recentCommandIds)
  const { ref: paletteTargetRef } = useFocusTarget<HTMLDivElement>({
    area: 'command-palette',
    capabilities: { overlay: true },
    id: { kind: 'command-palette' },
    onIntent: (intent, element) => {
      if (intent !== 'focus') return false

      const input = element.querySelector<HTMLElement>('[data-slot="command-input"]')
      if (!input) return false

      input.focus()
      return true
    },
  })

  useEffect(() => {
    if (mode !== 'colorTheme') clearEditorThemePreview()
    if (mode !== 'colorMode') clearThemePreview()
  }, [clearThemePreview, mode])

  useEffect(
    () => () => {
      clearEditorThemePreview()
      clearThemePreview()
    },
    [clearThemePreview],
  )

  function previewHighlightedColorTheme(value: string) {
    const themeId = colorThemeIdFromItemValue(value)
    if (!themeId) return

    previewEditorTheme(resolvedTheme, themeId)
  }

  function previewHighlightedColorMode(value: string) {
    previewColorModeItem(value, previewTheme)
  }

  const highlightedListRef = useHighlightedPaletteValue({
    enabled: isColorPreviewMode(mode),
    onHighlight: (value) => {
      if (mode === 'colorTheme') {
        previewHighlightedColorTheme(value)
        return
      }

      previewHighlightedColorMode(value)
    },
  })

  function handleCommandValueChange(value: string) {
    if (mode !== 'files') return

    setSelectedFileItemValue(value)
  }

  function handleSearchChange(value: string) {
    if (!paletteScope && quickAccessMode(value) === 'files') setSelectedFileItemValue(null)

    setPaletteSearch(value)
  }

  // Backspace on an empty scoped input is the way back out of a sub-picker, which is
  // why entering one clears the input: there is no prefix left to delete instead.
  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!paletteScope || event.key !== 'Backspace' || search.length > 0) return

    event.preventDefault()
    popPaletteScope()
  }

  // Context identity must stay stable while cmdk updates its controlled input.
  const actions = useMemo<CommandPaletteActions>(() => {
    async function focusSelectedEditor() {
      const workspaceState = workspace.getState()
      if (workspaceState.uiMode === 'chat') {
        workspaceState.setChatModePanels(
          showChatModeToolTab(workspaceState.chatModePanels, 'editor'),
        )
      }

      const destination = activeEditorFocusDestination(workspace)
      if (!destination) return false

      const outcome = await focus.request(destination).completion
      return focusTransitionAcknowledged(outcome)
    }

    async function revealDestination(
      command: 'workspace.revealTerminal' | 'workspace.showChatMode',
    ) {
      const ticket = bus.dispatch(command, paletteCommandInvocation(paletteOrigin))
      const outcome = await ticket.completion
      if (!paletteCommandSucceeded(outcome)) return false

      closePalette(false)
      return true
    }

    async function openSessionProject(projectId: (typeof sessionProjects)[number]['id']) {
      const project = sessionProjects.find((candidate) => candidate.id === projectId)
      if (!project) return false
      if (workspace.getState().rootFolder?.path === project.workspaceRoot) return true

      const outcome = await openWorkspaceRoot(project.workspaceRoot)
      return workspaceRootOpened(outcome)
    }

    return {
      disabledReasonForCommand: (command) => {
        const inspection = bus.inspect(command, paletteCommandInvocation(paletteOrigin))
        return inspection.status === 'disabled' ? inspection.reason : null
      },
      previewColorTheme: (themeId) => {
        previewEditorTheme(resolvedTheme, themeId)
      },
      selectColorTheme: (themeId) => {
        setSelectedEditorThemeId(resolvedTheme, themeId)
        closePalette(true)
      },
      selectFile: async (path) => {
        selectFile(path)
        if (!(await focusSelectedEditor())) return

        closePalette(false)
      },
      selectGotoLine: async (target) => {
        if (!selectedFileBackedPath) return

        const position = { character: target.column - 1, line: target.line - 1 }
        const handled = openDefinition({
          path: selectedFileBackedPath,
          range: { end: position, start: position },
          uri: fileUriForPath(selectedFileBackedPath),
        })
        if (!handled) return
        if (!(await focusSelectedEditor())) return

        closePalette(false)
      },
      selectPlatformCommand: async (command) => {
        const ticket = bus.dispatch(command, paletteCommandInvocation(paletteOrigin))
        const outcome = await ticket.completion
        if (!paletteCommandSucceeded(outcome)) return

        recordCommandUse(command)
        if (commandKeepsPaletteOpen(command)) return

        closePalette(true)
      },
      selectScript: async (script) => {
        saveProjectScript(script)
        queueTerminalCommand(script.command)
        await revealDestination('workspace.revealTerminal')
      },
      selectSession: async (session) => {
        if (!(await openSessionProject(session.projectId))) return

        openSessionRow(session)
        await revealDestination('workspace.showChatMode')
      },
      selectSymbol: async (symbol) => {
        if (!selectedFileBackedPath) return

        const handled = openDefinition({
          path: selectedFileBackedPath,
          range: symbol.selectionRange,
          uri: fileUriForPath(selectedFileBackedPath),
        })
        if (!handled) return
        if (!(await focusSelectedEditor())) return

        closePalette(false)
      },
      startSessionDraft: async (projectId) => {
        if (!(await openSessionProject(projectId))) return

        startSessionDraft(projectId)
        await revealDestination('workspace.showChatMode')
      },
    }
  }, [
    bus,
    closePalette,
    focus,
    openDefinition,
    openWorkspaceRoot,
    paletteOrigin,
    queueTerminalCommand,
    resolvedTheme,
    saveProjectScript,
    selectFile,
    selectedFileBackedPath,
    sessionProjects,
    workspace,
  ])

  return (
    <CommandDialog
      commandProps={{
        filter: paletteScope ? scopedPaletteFilter : quickAccessFilter,
        loop: true,
        onValueChange: handleCommandValueChange,
        shouldFilter: !paletteOwnsItemOrder(mode),
        value: selectedCommandValue,
      }}
      contentRef={paletteTargetRef}
      finalFocus={false}
      onOpenChange={setPaletteOpen}
      open={open}
      overlayClassName={
        isColorPreviewMode(mode) ? 'supports-backdrop-filter:backdrop-blur-none' : undefined
      }
    >
      <CommandInput
        placeholder={placeholderForMode(mode)}
        scope={paletteScope ? <ScopeChip label={scopeLabelForMode(paletteScope.mode)} /> : null}
        value={search}
        onKeyDown={handleSearchKeyDown}
        onValueChange={handleSearchChange}
      />
      <CommandList className='max-h-[min(440px,calc(100vh-8rem))] py-1' ref={highlightedListRef}>
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
