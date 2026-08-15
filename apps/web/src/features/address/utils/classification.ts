/**
 * Which state is a place, which is a preference, and which must never be replayed.
 *
 * Encoded as data rather than prose so a test can fail when a new persisted key
 * appears unclassified. That is the guard against the one drift this design cannot
 * otherwise catch: a new code path that persists something and never tells the
 * address layer it exists.
 */

export type StateClassification =
  /** Names where you are. Goes in the URL. */
  | 'address'
  /** How you like things drawn. Stays in localStorage; a link must never change it. */
  | 'preference'
  /** Must never be replayed from a URL, and several must never be durable at all. */
  | 'ephemeral'

export type ClassifiedState = {
  readonly classification: StateClassification
  /** The localStorage key, where one exists. In-memory stores have none. */
  readonly storageKey?: string
  readonly why: string
}

export const STATE_CLASSIFICATIONS: Readonly<Record<string, ClassifiedState>> = {
  address: {
    classification: 'address',
    storageKey: 'platform.address.v1',
    why: 'the address itself — the restore payload half of the dual serialization',
  },
  chatInputDrafts: {
    classification: 'ephemeral',
    storageKey: 'platform.chat-input-drafts.v1',
    why: 'unsent text is the archetypal non-linkable state',
  },
  chatModePanels: {
    classification: 'preference',
    storageKey: 'platform.workspace-state.v17.chatModePanels',
    why: 'fused: activeToolTab is address (?tool=), sessionRailOpen/toolPaneOpen are chrome',
  },
  chatModeSelection: {
    classification: 'address',
    storageKey: 'platform.workspace-state.v17.chatModeSelection',
    why: 't/<id> | t/new | absent — key retired once the address restores it',
  },
  chatProjection: {
    classification: 'ephemeral',
    storageKey: 'platform.chat-projection',
    why: 'projected server truth, replayed from the server on connect',
  },
  chatRailCollapse: {
    classification: 'preference',
    storageKey: 'platform.chat-rail-collapse.v1',
    why: 'tidying',
  },
  chatSessionReads: {
    classification: 'preference',
    storageKey: 'platform.chat-session-reads.v1',
    why: '"have I read this" is a property of this browser',
  },
  changedFilesExpansion: {
    classification: 'preference',
    storageKey: 'platform.chat-changed-files-expansion.v1',
    why: 'tidying',
  },
  commandPaletteOpen: {
    classification: 'ephemeral',
    why: 'an open menu is never a place; a finder’s result is the address',
  },
  commandPaletteRecents: {
    classification: 'preference',
    storageKey: 'platform.command-palette.recent-commands.v1',
    why: 'an MRU of commands you ran, not a place you can be',
  },
  composerInbox: {
    classification: 'ephemeral',
    why: 'take-once queue; a replayed URL would inject prompt text on load',
  },
  conflictDocuments: {
    classification: 'ephemeral',
    why: 'born from a watcher event, holds its text in memory, cannot survive a reload',
  },
  definitionTarget: {
    classification: 'address',
    why: '#L… — the intra-document position',
  },
  editorColorTheme: {
    classification: 'preference',
    storageKey: 'platform.editor-color-theme.v1',
    why: 'machine appearance',
  },
  editorHistory: {
    classification: 'preference',
    why: 'MRU stack, not a place',
  },
  gitCommitMessage: {
    classification: 'ephemeral',
    why: 'a draft, and live commit output is a stream',
  },
  logsFilter: {
    classification: 'address',
    why: 'log.* — persists nothing today, so the feature strictly gains',
  },
  promptStash: {
    classification: 'ephemeral',
    storageKey: 'platform.prompt-stash.v1',
    why: 'unsent text; the colon-namespaced key was renamed to the dotted convention',
  },
  railScope: {
    classification: 'ephemeral',
    why: 'a ProjectId — a one-way hash of an absolute path — so it cannot go in a URL at all',
  },
  railView: {
    classification: 'address',
    why: '?rail=archived — a moment, not a preference',
  },
  resizableLayoutChatMode: {
    classification: 'preference',
    storageKey: 'platform.resizable-layout.chat-mode',
    why: 'geometry; a link must never resize your window',
  },
  rootFolder: {
    classification: 'address',
    storageKey: 'platform.workspace-state.v17.rootFolder',
    why: '~slug; the absolute path stays local',
  },
  scrollPositions: {
    classification: 'preference',
    why: 'remembered position ≠ addressed position',
  },
  searchBuffer: {
    classification: 'preference',
    why: 'fused: query and flags are address (s.*), histories and matches are not',
  },
  searchReplaceText: {
    classification: 'ephemeral',
    why: 'a link that prefills a bulk-replace field is one click from data loss',
  },
  sessionDeleteRequest: {
    classification: 'ephemeral',
    why: 'a link must never open a delete dialog',
  },
  sessionIsolation: {
    classification: 'ephemeral',
    why: 'arms the next send to create a worktree; must not survive a back press',
  },
  sessionMultiSelect: {
    classification: 'ephemeral',
    why: 'would arm a destructive action the user no longer remembers making',
  },
  settingsBootMirror: {
    classification: 'preference',
    storageKey: 'platform.settings-boot-mirror.v1',
    why: 'the settings snapshot read before the first query lands',
  },
  settingsCategory: {
    classification: 'address',
    why: '?settings= selects a category on the settings page',
  },
  terminalCommandInbox: {
    classification: 'ephemeral',
    why: 'take-once queue; a replayed URL would run a shell command on load',
  },
  threadDiffScope: {
    classification: 'address',
    storageKey: 'platform.chat-thread-diff-scope.v1',
    why: '?diff=wt | ?diff=turn-<id>',
  },
  uiMode: {
    classification: 'address',
    storageKey: 'platform.workspace-state.v17.uiMode',
    why: 'path segment 2 — key retired once the address restores it',
  },
  workbenchBottomTab: {
    classification: 'address',
    why: '?bottom=',
  },
  workbenchEditorTabs: {
    classification: 'address',
    why: '?tabs= when present; otherwise deferred to the remembered slice',
  },
  workbenchLayout: {
    classification: 'preference',
    storageKey: 'platform.workspace-state.v17.workbenchLayout',
    why: 'pane geometry is global; a link must never resize your window',
  },
  workbenchSidebarTab: {
    classification: 'address',
    why: '?side=',
  },
  workspaceIndex: {
    classification: 'preference',
    storageKey: 'platform.workspace-state.v17.workspaces',
    why: 'the slug→root oracle, not an address',
  },
}

/** Every storage key the table accounts for, for the drift test. */
export function classifiedStorageKeys() {
  return new Set(
    Object.values(STATE_CLASSIFICATIONS).flatMap((entry) =>
      entry.storageKey ? [entry.storageKey] : [],
    ),
  )
}

export function statesClassifiedAs(classification: StateClassification) {
  return Object.entries(STATE_CLASSIFICATIONS)
    .filter(([, entry]) => entry.classification === classification)
    .map(([name]) => name)
}
