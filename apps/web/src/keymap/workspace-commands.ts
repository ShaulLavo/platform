import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  BracketsCurlyIcon,
  CardsIcon,
  ClockCounterClockwiseIcon,
  CommandIcon,
  CrosshairIcon,
  DesktopIcon,
  FileMagnifyingGlassIcon,
  FloppyDiskBackIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
  GearSixIcon,
  GitDiffIcon,
  ImageIcon,
  MoonIcon,
  PaletteIcon,
  SidebarSimpleIcon,
  SquareHalfBottomIcon,
  SquaresFourIcon,
  SunIcon,
  XIcon,
} from '@phosphor-icons/react'
import type { QueryClient } from '@tanstack/react-query'

import { shareableAddress } from '@/features/address/state/storage'
import {
  jumpToSession,
  selectAdjacentSession,
  startScopedSessionDraft,
  type SessionTraversalDirection,
} from '@/features/chat-mode/state/session-commands'
import { useSessionIsolationStore } from '@/features/chat-mode/state/session-isolation-store'
import { setChatModeSessionRailOpen } from '@/features/chat-mode/utils/panels'
import { compareSavedDocumentId } from '@/features/editor/utils/compare-saved-document'
import { fileBackedDocumentPath } from '@/features/editor/utils/file-backed-document'
import { saveAllEditorDocuments, saveSelectedEditorDocument } from '@/features/editor/utils/save'
import type { RequestCloseTab } from '@/features/editor/hooks/use-dirty-tab-close'
import type { EditorDocumentStoreApi } from '@/features/editor/state/document-state'
import { nextEditorDiffViewMode } from '@/features/editor/utils/diff-view-mode'
import {
  openEditorPathInWorkbenchPanels,
  setWorkbenchBottomTab,
  setWorkbenchSidebarTab,
} from '@/features/workbench/utils/panels'
import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import { fetchFile } from '@/lib/file-server'
import { setFileSnapshotQueryData } from '@/lib/file-snapshot-query-cache'
import { toggledWorkspaceUiMode } from '@/lib/ui-mode'

import { defineCommand, type WorkspaceCommandContext } from './define-command'
import { SESSION_JUMP_POSITIONS, sessionJumpCommandId } from './types'

/**
 * Session traversal only means something while the chat layout is the one on screen —
 * in the workbench there is no rail to count rows in and no stage to hand them to.
 */
function runSessionCommand(context: WorkspaceCommandContext, run: () => boolean) {
  if (context.uiMode !== 'chat') return false

  return run()
}

function sessionTraversalHandler(direction: SessionTraversalDirection) {
  return (context: WorkspaceCommandContext) =>
    runSessionCommand(context, () => selectAdjacentSession(direction))
}

function closeSelectedTab(activeTabId: string | null, requestCloseTab: RequestCloseTab) {
  if (!activeTabId) return false

  requestCloseTab(activeTabId)
  return true
}

function runFileLifecycle(activeFilePath: string | null, operation: () => Promise<boolean>) {
  if (!fileBackedDocumentPath(activeFilePath)) return false

  void operation().catch(reportCommandError)
  return true
}

async function revertSelectedEditorDocument(
  documentStore: EditorDocumentStoreApi,
  queryClient: QueryClient,
  activeFilePath: string | null,
) {
  const path = fileBackedDocumentPath(activeFilePath)
  if (!path) return false

  const file = await fetchFile(path, new AbortController().signal)
  setFileSnapshotQueryData(queryClient, file)
  documentStore.getState().forceReplaceLiveEditorDocument(file, path)
  return true
}

function reportCommandError(error: unknown) {
  reportError(toClientError(error))
}

/**
 * The nine jump slots are one shape, so they are written once. They are hidden
 * from the palette for the same reason as their four named siblings: outside
 * chat mode `runSessionCommand` returns false, and `requires` has no chat-mode
 * state to model, so a visible row would look enabled and do nothing.
 */
function sessionJumpCommands() {
  return SESSION_JUMP_POSITIONS.map((position) =>
    defineCommand({
      category: 'Workspace',
      description: `Put session ${position} in the rail on the stage.`,
      hiddenInPalette: true,
      id: sessionJumpCommandId(position),
      keys: [{ hotkey: `Mod+Alt+${position}`, preventDefault: true }],
      requires: 'workspace',
      run: (context) => runSessionCommand(context, () => jumpToSession(position)),
      title: `Go to session ${position}`,
    }),
  )
}

export const workspaceCommands = [
  defineCommand({
    category: 'Workspace',
    description: 'Search workspace files and quick actions.',
    icon: FileMagnifyingGlassIcon,
    id: 'workspace.showQuickAccess',
    keepsPaletteOpen: true,
    keys: [
      {
        hotkey: 'Mod+P',
        preventDefault: true,
        stopPropagation: true,
        vscodeCommandId: 'workbench.action.quickOpen',
      },
    ],
    requires: 'workspace',
    run: ({ showCommandPalette }) => {
      showCommandPalette('')
      return true
    },
    title: 'Quick Open',
    vscodeCommandIds: ['workbench.action.quickOpen'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Search and run workspace or editor commands.',
    hiddenInPalette: true,
    icon: CommandIcon,
    id: 'workspace.showCommandPalette',
    keepsPaletteOpen: true,
    keys: [
      {
        hotkey: 'Mod+Shift+P',
        preventDefault: true,
        stopPropagation: true,
        vscodeCommandId: 'workbench.action.showCommands',
      },
      {
        hotkey: 'F1',
        preventDefault: true,
        stopPropagation: true,
        vscodeCommandId: 'workbench.action.showCommands',
      },
    ],
    requires: 'nothing',
    run: ({ showCommandPalette }) => {
      showCommandPalette('>')
      return true
    },
    title: 'Show command palette',
    vscodeCommandIds: ['workbench.action.showCommands'],
  }),
  // Settings are machine-wide, so this is the one workspace command that stays
  // available with no folder open — it is where a provider gets configured in
  // the first place.
  defineCommand({
    category: 'Workspace',
    description: 'Open providers, models, and keybindings.',
    icon: GearSixIcon,
    id: 'workspace.showSettings',
    keys: [
      {
        hotkey: 'Mod+,',
        preventDefault: true,
        stopPropagation: true,
        vscodeCommandId: 'workbench.action.openSettings',
      },
    ],
    requires: 'nothing',
    run: ({ showSettings }) => {
      showSettings()
      return true
    },
    title: 'Settings',
    vscodeCommandIds: ['workbench.action.openSettings'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Open the workspace file picker.',
    icon: FolderOpenIcon,
    id: 'workspace.openFilePicker',
    requires: 'nothing',
    run: ({ openPicker }) => {
      openPicker()
      return true
    },
    title: 'Open file picker',
    vscodeCommandIds: ['workbench.action.quickOpen'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Open workspace search results in an editor tab.',
    icon: FileMagnifyingGlassIcon,
    id: 'workspace.openSearchEditor',
    requires: 'workspace',
    run: ({ openSearchEditor, requestEditorFocus, rootPath }) => {
      if (!rootPath) return false

      openSearchEditor(rootPath)
      requestEditorFocus()
      return true
    },
    title: 'Open Search Editor',
    vscodeCommandIds: ['search.action.openNewEditor'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Switch to the previously active editor.',
    icon: ClockCounterClockwiseIcon,
    id: 'workspace.quickOpenPreviousEditor',
    requires: 'workspace',
    run: ({ requestEditorFocus, selectPreviousEditor }) => {
      const selected = selectPreviousEditor()
      if (!selected) return false

      requestEditorFocus()
      return true
    },
    title: 'Quick open previous editor',
    vscodeCommandIds: ['workbench.action.quickOpenPreviousEditor'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Search and focus workspace views.',
    icon: SquaresFourIcon,
    id: 'workspace.quickOpenView',
    keepsPaletteOpen: true,
    requires: 'workspace',
    run: ({ showCommandPalette }) => {
      showCommandPalette('view ')
      return true
    },
    title: 'Open view',
    vscodeCommandIds: ['workbench.action.quickOpenView'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Search symbols in the active editor.',
    icon: BracketsCurlyIcon,
    id: 'workspace.gotoSymbol',
    keepsPaletteOpen: true,
    keys: [
      {
        hotkey: 'Mod+Shift+O',
        preventDefault: true,
        vscodeCommandId: 'workbench.action.gotoSymbol',
      },
    ],
    requires: 'file',
    run: ({ activeFilePath, showCommandPalette }) => {
      if (!fileBackedDocumentPath(activeFilePath)) return false

      showCommandPalette('@')
      return true
    },
    title: 'Go to symbol in editor',
    vscodeCommandIds: ['workbench.action.gotoSymbol'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Search open editor tabs.',
    icon: CardsIcon,
    id: 'workspace.showAllEditors',
    keepsPaletteOpen: true,
    requires: 'workspace',
    run: ({ showCommandPalette }) => {
      showCommandPalette('edt ')
      return true
    },
    title: 'Show all editors',
    vscodeCommandIds: ['workbench.action.showAllEditors'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Save the active editor.',
    icon: FloppyDiskIcon,
    id: 'workspace.saveFile',
    keys: [
      { hotkey: 'Mod+S', preventDefault: true, vscodeCommandId: 'workbench.action.files.save' },
    ],
    requires: 'file',
    run: ({ activeFilePath, documentStore, queryClient }) =>
      runFileLifecycle(activeFilePath, () =>
        saveSelectedEditorDocument(documentStore, queryClient, activeFilePath),
      ),
    title: 'Save',
    vscodeCommandIds: ['workbench.action.files.save'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Save all dirty editors.',
    icon: FloppyDiskBackIcon,
    id: 'workspace.saveAllFiles',
    requires: 'workspace',
    run: ({ documentStore, queryClient }) => {
      void saveAllEditorDocuments(documentStore, queryClient).catch(reportCommandError)
      return true
    },
    title: 'Save all',
    vscodeCommandIds: ['workbench.action.files.saveAll'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Diff the active editor against the file on disk.',
    id: 'workspace.compareWithSaved',
    requires: 'file',
    run: ({ activeFilePath, requestEditorFocus, setWorkbenchPanels, workbenchPanels }) => {
      const path = fileBackedDocumentPath(activeFilePath)
      if (!path) return false

      setWorkbenchPanels(
        openEditorPathInWorkbenchPanels(workbenchPanels, compareSavedDocumentId(path)),
      )
      requestEditorFocus()
      return true
    },
    title: 'Compare with saved',
    vscodeCommandIds: ['workbench.files.action.compareWithSaved'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Open the committed version of the active file, read-only.',
    id: 'workspace.openFileAtHead',
    requires: 'file',
    run: ({ activeFilePath, openFileAtRef }) => {
      const path = fileBackedDocumentPath(activeFilePath)
      if (!path) return false

      void openFileAtRef(path, 'HEAD').catch(reportCommandError)
      return true
    },
    title: 'Open file at HEAD',
    vscodeCommandIds: ['git.openFile'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Reload the active editor from disk.',
    icon: ArrowCounterClockwiseIcon,
    id: 'workspace.revertFile',
    requires: 'file',
    run: ({ activeFilePath, documentStore, queryClient }) =>
      runFileLifecycle(activeFilePath, () =>
        revertSelectedEditorDocument(documentStore, queryClient, activeFilePath),
      ),
    title: 'Revert file',
    vscodeCommandIds: ['workbench.action.files.revert'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Reopen the most recently closed editor tab.',
    icon: ArrowClockwiseIcon,
    id: 'workspace.reopenClosedEditor',
    requires: 'workspace',
    run: ({ reopenClosedEditor }) => reopenClosedEditor(),
    title: 'Reopen closed editor',
    vscodeCommandIds: ['workbench.action.reopenClosedEditor'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Open, collapse, expand, or focus the Files pane.',
    icon: SidebarSimpleIcon,
    id: 'workspace.toggleSidebarVisibility',
    keys: [
      {
        hotkey: 'Mod+B',
        preventDefault: true,
        vscodeCommandId: 'workbench.action.toggleSidebarVisibility',
      },
    ],
    requires: 'workspace',
    run: ({ setFocusArea, setWorkbenchPanels, workbenchPanels }) => {
      setWorkbenchPanels(setWorkbenchSidebarTab(workbenchPanels, 'files'))
      setFocusArea('file-tree')
      return true
    },
    title: 'Toggle Files pane',
    vscodeCommandIds: ['workbench.action.toggleSidebarVisibility'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Show or hide the active workspace panel.',
    icon: SquareHalfBottomIcon,
    id: 'workspace.togglePanel',
    requires: 'workspace',
    run: ({ setFocusArea, setWorkbenchPanels, workbenchPanels }) => {
      setWorkbenchPanels(setWorkbenchBottomTab(workbenchPanels, 'terminal'))
      setFocusArea('terminal')
      return true
    },
    title: 'Toggle panel',
    vscodeCommandIds: ['workbench.action.togglePanel'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Focus the primary editor group.',
    icon: CrosshairIcon,
    id: 'workspace.focusFirstEditorGroup',
    requires: 'workspace',
    run: ({ requestEditorFocus }) => {
      requestEditorFocus()
      return true
    },
    title: 'Focus first editor group',
    vscodeCommandIds: ['workbench.action.focusFirstEditorGroup'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Focus the current editor group in single-group mode.',
    icon: CrosshairIcon,
    id: 'workspace.focusSecondEditorGroup',
    requires: 'workspace',
    run: ({ requestEditorFocus }) => {
      requestEditorFocus()
      return true
    },
    title: 'Focus second editor group',
    vscodeCommandIds: ['workbench.action.focusSecondEditorGroup'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Focus the current editor group in single-group mode.',
    icon: CrosshairIcon,
    id: 'workspace.focusThirdEditorGroup',
    requires: 'workspace',
    run: ({ requestEditorFocus }) => {
      requestEditorFocus()
      return true
    },
    title: 'Focus third editor group',
    vscodeCommandIds: ['workbench.action.focusThirdEditorGroup'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Move keyboard focus to the editor.',
    icon: CrosshairIcon,
    id: 'workspace.focusEditor',
    requires: 'workspace',
    run: ({ requestEditorFocus }) => {
      requestEditorFocus()
      return true
    },
    title: 'Focus editor',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Move keyboard focus to the file tree.',
    icon: CrosshairIcon,
    id: 'workspace.focusFileTree',
    requires: 'workspace',
    run: ({ setFocusArea, setWorkbenchPanels, workbenchPanels }) => {
      setWorkbenchPanels(setWorkbenchSidebarTab(workbenchPanels, 'files'))
      setFocusArea('file-tree')
      return true
    },
    title: 'Focus file tree',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Move keyboard focus to the Git panel.',
    icon: CrosshairIcon,
    id: 'workspace.focusGit',
    requires: 'workspace',
    run: ({ setFocusArea, setWorkbenchPanels, workbenchPanels }) => {
      setWorkbenchPanels(setWorkbenchSidebarTab(workbenchPanels, 'git'))
      setFocusArea('git')
      return true
    },
    title: 'Focus Git',
  }),
  defineCommand({
    category: 'Workspace',
    description:
      'Copy a link to exactly where you are — no absolute paths, no dev-only parameters.',
    id: 'workspace.copyAddress',
    requires: 'workspace',
    run: () => {
      if (!navigator.clipboard?.writeText) return false

      // The address bar already holds the full address — thread, tool pane, filters and
      // all. Rebuilding a workbench-only subset here copied a strictly weaker link than
      // the one on screen, which defeats the point of the command.
      //
      // Through `shareableAddress`, not the raw location: a copied link needs an origin
      // to be openable at all, and it must not carry the dev params, which belong to the
      // session someone typed them into rather than to everyone they send the link to.
      void navigator.clipboard.writeText(shareableAddress()).catch(reportCommandError)
      return true
    },
    title: 'Copy address',
  }),
  // History is the browser's, so back and forward are one call each. The popstate
  // listener in the address layer is what turns the move into applied state.
  //
  // Mod+[ and Mod+] are app bindings too, not only the editor's outdent/indent
  // pair. Outside the editor these keys used to reach the browser untouched,
  // which was harmless only while there was no history to walk; now that there
  // is, the app has to own them or a back press in the file tree leaves the
  // workspace entirely.
  defineCommand({
    category: 'Workspace',
    description: 'Go back to the previous document.',
    id: 'workspace.navigateBack',
    keys: [{ hotkey: 'Mod+[' }],
    requires: 'workspace',
    run: () => {
      history.back()
      return true
    },
    title: 'Back',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Go forward again.',
    id: 'workspace.navigateForward',
    keys: [{ hotkey: 'Mod+]' }],
    requires: 'workspace',
    run: () => {
      history.forward()
      return true
    },
    title: 'Forward',
  }),
  // Chat mode already puts the composer on the stage, so only the workbench has
  // anything to reveal — and there it is a sidebar tab, not a focus target: the
  // caller (terminal capture today) is handing over context, not the keyboard.
  defineCommand({
    category: 'Workspace',
    description: 'Bring the chat composer on screen.',
    id: 'workspace.revealChat',
    requires: 'workspace',
    run: ({ setWorkbenchPanels, uiMode, workbenchPanels }) => {
      if (uiMode === 'chat') return true

      setWorkbenchPanels(setWorkbenchSidebarTab(workbenchPanels, 'chat'))
      return true
    },
    title: 'Show chat',
  }),
  // Unlike the chat reveal, this one has somewhere to go from either mode: the
  // terminal lives in the workbench, so a caller in chat mode has to be taken
  // there or its command runs somewhere the user cannot see.
  defineCommand({
    category: 'Workspace',
    description: 'Bring the workbench terminal on screen.',
    id: 'workspace.revealTerminal',
    requires: 'workspace',
    run: ({ setFocusArea, setUiMode, setWorkbenchPanels, workbenchPanels }) => {
      setUiMode('workbench')
      setWorkbenchPanels(setWorkbenchBottomTab(workbenchPanels, 'terminal'))
      setFocusArea('terminal')
      return true
    },
    title: 'Show terminal',
  }),
  // Arms the next send rather than creating anything now: the worktree is
  // prepared when the message is actually sent, so an armed draft the user
  // abandons leaves no checkout behind to clean up.
  defineCommand({
    category: 'Workspace',
    description: 'Run the next session on its own branch in a separate checkout.',
    id: 'workspace.newIsolatedSession',
    requires: 'workspace',
    run: ({ setUiMode }) => {
      useSessionIsolationStore.getState().setIsolateNextSession(true)
      setUiMode('chat')
      return true
    },
    title: 'New session in its own worktree',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Close the selected editor tab.',
    icon: XIcon,
    id: 'workspace.closeCurrentTab',
    requires: 'file',
    run: ({ activeTabId, requestCloseTab }) => closeSelectedTab(activeTabId, requestCloseTab),
    title: 'Close current tab',
    vscodeCommandIds: ['workbench.action.closeActiveEditor'],
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Switch the active diff viewer between split and unified modes.',
    icon: GitDiffIcon,
    id: 'workspace.toggleDiffViewMode',
    keys: [{ hotkey: 'Mod+Shift+D' }],
    requires: 'workspace',
    run: ({ diffViewMode, setDiffViewMode }) => {
      // Through the settings write path: the command and the settings page are two
      // front doors onto one value.
      setDiffViewMode(nextEditorDiffViewMode(diffViewMode))
      return true
    },
    title: 'Toggle diff view mode',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Switch between the Workbench and Chat layouts.',
    id: 'workspace.toggleUiMode',
    keys: [{ hotkey: 'Mod+Shift+M', preventDefault: true }],
    requires: 'workspace',
    run: ({ setUiMode, uiMode }) => {
      setUiMode(toggledWorkspaceUiMode(uiMode))
      return true
    },
    title: 'Toggle Chat mode',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Show sessions, chat, and tools in the chat layout.',
    id: 'workspace.showChatMode',
    requires: 'workspace',
    run: ({ setUiMode }) => {
      setUiMode('chat')
      return true
    },
    title: 'Chat mode',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Show the editor-centred workbench layout.',
    id: 'workspace.showWorkbenchMode',
    requires: 'workspace',
    run: ({ setUiMode }) => {
      setUiMode('workbench')
      return true
    },
    title: 'Workbench mode',
  }),
  defineCommand({
    category: 'Appearance',
    description: 'Pick light, dark, or system color mode.',
    icon: PaletteIcon,
    id: 'workspace.selectColorMode',
    keepsPaletteOpen: true,
    requires: 'nothing',
    run: ({ showCommandPalette }) => {
      showCommandPalette('color ')
      return true
    },
    title: 'Choose color mode',
  }),
  defineCommand({
    category: 'Appearance',
    description: 'Pick the editor color theme from the bundled VSCode themes.',
    icon: PaletteIcon,
    id: 'workspace.selectColorTheme',
    keepsPaletteOpen: true,
    requires: 'nothing',
    run: ({ showCommandPalette }) => {
      showCommandPalette('theme ')
      return true
    },
    title: 'Choose color theme',
  }),
  defineCommand({
    category: 'Appearance',
    description: 'Use dark color mode.',
    hiddenInPalette: true,
    icon: MoonIcon,
    id: 'workspace.setDarkTheme',
    requires: 'nothing',
    run: ({ setTheme }) => {
      setTheme('dark')
      return true
    },
    title: 'Dark color mode',
  }),
  defineCommand({
    category: 'Appearance',
    description: 'Use light color mode.',
    hiddenInPalette: true,
    icon: SunIcon,
    id: 'workspace.setLightTheme',
    requires: 'nothing',
    run: ({ setTheme }) => {
      setTheme('light')
      return true
    },
    title: 'Light color mode',
  }),
  defineCommand({
    category: 'Appearance',
    description: 'Follow the system color mode.',
    hiddenInPalette: true,
    icon: DesktopIcon,
    id: 'workspace.setSystemTheme',
    requires: 'nothing',
    run: ({ setTheme }) => {
      setTheme('system')
      return true
    },
    title: 'System color mode',
  }),
  defineCommand({
    category: 'Appearance',
    description: 'Show or hide the background image or video.',
    icon: ImageIcon,
    id: 'workspace.toggleWallpaper',
    requires: 'nothing',
    run: ({ setWallpaperEnabled, wallpaperEnabled }) => {
      // Through the settings write path, not a store setter. The command and the
      // settings page are two front doors onto one value; if they wrote to
      // different places they would disagree the first time either was used.
      setWallpaperEnabled(!wallpaperEnabled)
      return true
    },
    title: 'Toggle wallpaper',
  }),
  // Chat sessions all sit under Mod+Alt: the plain Mod digits are reserved for the
  // editor groups VS Code puts there, and Mod+B already toggles the Files pane.
  defineCommand({
    category: 'Workspace',
    description: 'Start a new chat session in the active project.',
    hiddenInPalette: true,
    id: 'workspace.newSession',
    keys: [{ hotkey: 'Mod+Alt+N', preventDefault: true }],
    requires: 'workspace',
    run: (context) => runSessionCommand(context, startScopedSessionDraft),
    title: 'New session',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Move to the next session in the rail.',
    hiddenInPalette: true,
    id: 'workspace.nextSession',
    keys: [{ hotkey: 'Mod+Alt+]', preventDefault: true }],
    requires: 'workspace',
    run: sessionTraversalHandler('next'),
    title: 'Next session',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Move to the previous session in the rail.',
    hiddenInPalette: true,
    id: 'workspace.previousSession',
    keys: [{ hotkey: 'Mod+Alt+[', preventDefault: true }],
    requires: 'workspace',
    run: sessionTraversalHandler('previous'),
    title: 'Previous session',
  }),
  defineCommand({
    category: 'Workspace',
    description: 'Show or hide the list of sessions.',
    hiddenInPalette: true,
    id: 'workspace.toggleSessionRail',
    keys: [{ hotkey: 'Mod+Alt+B', preventDefault: true }],
    requires: 'workspace',
    run: (context) =>
      runSessionCommand(context, () => {
        context.setChatModePanels(
          setChatModeSessionRailOpen(
            context.chatModePanels,
            !context.chatModePanels.sessionRailOpen,
          ),
        )

        return true
      }),
    title: 'Toggle session rail',
  }),
  ...sessionJumpCommands(),
]

export type WorkspaceCommandId = (typeof workspaceCommands)[number]['id']
