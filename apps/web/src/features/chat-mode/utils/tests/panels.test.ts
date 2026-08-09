import {
  createDefaultChatModePanels,
  isChatModeToolTab,
  setChatModeSessionRailOpen,
  showChatModeToolTab,
  toggleChatModeToolTab,
} from '@/features/chat-mode/utils/panels'
import { expect, test } from '../../../../../test/fixtures'

test('picking a different tab reveals it in the pane', () => {
  const panels = toggleChatModeToolTab(createDefaultChatModePanels(), 'files')

  expect(panels.activeToolTab).toBe('files')
  expect(panels.toolPaneOpen).toBe(true)
})

test('picking the open tab collapses the pane, and picking it again reopens it', () => {
  const collapsed = toggleChatModeToolTab(createDefaultChatModePanels(), 'git')
  expect(collapsed.toolPaneOpen).toBe(false)

  const reopened = toggleChatModeToolTab(collapsed, 'git')
  expect(reopened.toolPaneOpen).toBe(true)
  expect(reopened.activeToolTab).toBe('git')
})

test('revealing a tab never collapses the pane', () => {
  const collapsed = toggleChatModeToolTab(createDefaultChatModePanels(), 'git')

  expect(showChatModeToolTab(collapsed, 'git').toolPaneOpen).toBe(true)
  expect(showChatModeToolTab(collapsed, 'editor')).toMatchObject({
    activeToolTab: 'editor',
    toolPaneOpen: true,
  })
})

test('revealing the tab already shown keeps the same panels object', () => {
  const panels = createDefaultChatModePanels()

  expect(showChatModeToolTab(panels, panels.activeToolTab)).toBe(panels)
})

test('session rail visibility only changes on a real toggle', () => {
  const panels = createDefaultChatModePanels()

  expect(setChatModeSessionRailOpen(panels, true)).toBe(panels)
  expect(setChatModeSessionRailOpen(panels, false).sessionRailOpen).toBe(false)
})

test('rejects tool tabs that are not part of the rail', () => {
  expect(isChatModeToolTab('git')).toBe(true)
  expect(isChatModeToolTab('chat')).toBe(false)
  expect(isChatModeToolTab(null)).toBe(false)
})
