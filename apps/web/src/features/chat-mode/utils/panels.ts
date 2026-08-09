export type ChatModeToolTab =
  | 'editor'
  | 'files'
  | 'git'
  | 'logs'
  | 'problems'
  | 'search'
  | 'terminal'

export type ChatModePanels = {
  readonly activeToolTab: ChatModeToolTab
  readonly sessionRailOpen: boolean
  readonly toolPaneOpen: boolean
}

export const CHAT_MODE_TOOL_TABS: readonly ChatModeToolTab[] = [
  'git',
  'files',
  'editor',
  'search',
  'terminal',
  'problems',
  'logs',
]

export const SESSION_RAIL_MIN_SIZE = 220
export const SESSION_RAIL_MAX_SIZE = 460
export const SESSION_RAIL_DEFAULT_SIZE = 300
export const TOOL_PANE_MIN_SIZE = 280
export const TOOL_PANE_MAX_SIZE = 720
export const TOOL_PANE_DEFAULT_SIZE = 420

export function createDefaultChatModePanels(): ChatModePanels {
  return {
    activeToolTab: 'git',
    sessionRailOpen: true,
    toolPaneOpen: true,
  }
}

export function isChatModeToolTab(value: unknown): value is ChatModeToolTab {
  if (typeof value !== 'string') return false

  return CHAT_MODE_TOOL_TABS.includes(value as ChatModeToolTab)
}

/** Picking the open tab collapses the pane, matching how the rail reads as a toggle strip. */
export function toggleChatModeToolTab(
  panels: ChatModePanels,
  activeToolTab: ChatModeToolTab,
): ChatModePanels {
  if (panels.activeToolTab === activeToolTab) {
    return { ...panels, toolPaneOpen: !panels.toolPaneOpen }
  }

  return showChatModeToolTab(panels, activeToolTab)
}

/** Reveals a tab without the toggle behaviour, for code that opens a pane on the user's behalf. */
export function showChatModeToolTab(
  panels: ChatModePanels,
  activeToolTab: ChatModeToolTab,
): ChatModePanels {
  if (panels.activeToolTab === activeToolTab && panels.toolPaneOpen) return panels

  return { ...panels, activeToolTab, toolPaneOpen: true }
}

export function setChatModeSessionRailOpen(
  panels: ChatModePanels,
  sessionRailOpen: boolean,
): ChatModePanels {
  if (panels.sessionRailOpen === sessionRailOpen) return panels

  return { ...panels, sessionRailOpen }
}

export function chatModeToolTabLabel(tab: ChatModeToolTab) {
  if (tab === 'editor') return 'Editor'
  if (tab === 'files') return 'Files'
  if (tab === 'git') return 'Git'
  if (tab === 'logs') return 'Logs'
  if (tab === 'problems') return 'Problems'
  if (tab === 'search') return 'Search'

  return 'Terminal'
}
