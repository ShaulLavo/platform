import { useLayoutEffect, useMemo, useRef } from 'react'

import { ChromeEditorTabList } from '@/components/workspace/chrome-editor-tab-list'
import { DiffTabActions } from '@/components/workspace/diff-tab-actions'
import {
  EMPTY_GIT_FILES,
  editorTabModel,
  sameEditorTabModel,
} from '@/components/workspace/editor-tab-model'
import { scrollSelectedTabIntoView } from '@/components/workspace/editor-tab-scroll'
import {
  DEFAULT_EDITOR_TAB_SIZING,
  type EditorTabModel,
  type EditorTabSizing,
} from '@/components/workspace/editor-tab-types'
import { LegacyEditorTabList } from '@/components/workspace/legacy-editor-tab-list'
import { useChromeVisualTabs } from '@/components/workspace/use-chrome-visual-tabs'
import { useEditorTabDrag } from '@/components/workspace/use-editor-tab-drag'
import { useEditorTabIntentPrefetch } from '@/components/workspace/use-editor-tab-intent-prefetch'
import { useWorkspaceFocus } from '@/components/workspace/workspace-focus-state'
import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { useEditorConflictState } from '@/features/editor/state/editor-conflict-state'
import { activeTabForPane, findEditorPane } from '@/features/editor/state/editor-pane-state'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import type { EditorDiffViewMode } from '@/features/editor/utils/diff-view-mode'
import { useStatus } from '@/features/git/hooks'
import { parseDiffDocumentId } from '@/features/git/diff-document'
import { cn } from '@workspace/ui/lib/utils'

export type { EditorTabSizing } from '@/components/workspace/editor-tab-types'

export function EditorTabBar({
  diffViewMode = null,
  onDiffViewModeChange,
  onRequestCloseTab,
  onRequestCloseTabs,
  onRevealNextChange,
  onRevealPreviousChange,
  paneId,
  rootPath,
  tabSizing = DEFAULT_EDITOR_TAB_SIZING,
}: {
  diffViewMode?: EditorDiffViewMode | null
  onDiffViewModeChange?: (mode: EditorDiffViewMode) => void
  onRequestCloseTab: RequestCloseTab
  onRequestCloseTabs: RequestCloseTabs
  onRevealNextChange?: () => void
  onRevealPreviousChange?: () => void
  paneId: string
  rootPath: string
  tabSizing?: EditorTabSizing
}) {
  const selectedTabRef = useRef<HTMLDivElement>(null)
  const tabListRef = useRef<HTMLDivElement>(null)
  const editorPaneLayout = useEditorWorkspaceState((state) => state.editorPaneLayout)
  const pane = findEditorPane(editorPaneLayout.root, paneId)
  const selectedTab = pane ? activeTabForPane(pane) : null
  const selectedFilePath = selectedTab?.path ?? null
  const selectedDiff = parseDiffDocumentId(selectedFilePath)
  const conflicts = useEditorConflictState((state) => state.conflicts)
  const { moveTabToPane, reorderTab, selectFile, selectTab, splitTab } = useEditorCommands()
  const requestEditorFocus = useWorkspaceFocus((state) => state.requestEditorFocus)
  const gitStatus = useStatus(rootPath)
  const gitFiles = gitStatus.data?.files ?? EMPTY_GIT_FILES
  const editorTabs = useMemo(
    () =>
      (pane?.tabs ?? []).map((tab) =>
        editorTabModel({
          conflicts,
          gitFiles,
          tab,
          rootPath,
          selectedTabId: selectedTab?.id ?? null,
        }),
      ),
    [conflicts, gitFiles, pane?.tabs, rootPath, selectedTab?.id],
  )
  const visualTabs = useChromeVisualTabs(editorTabs, tabSizing === 'chrome', sameEditorTabModel)
  const tabPrefetchEnabled = Boolean(pane && (pane.tabs.length > 0 || visualTabs.length > 0))
  const tabDrag = useEditorTabDrag({
    paneId,
    tabs: editorTabs,
    onMoveToPane: (tabId, targetIndex) => moveTabToPane(tabId, paneId, targetIndex),
    tabListRef,
    onReorder: (tabId, targetIndex) => reorderTab(paneId, tabId, targetIndex),
  })

  useLayoutEffect(() => {
    if (tabSizing === 'chrome') return
    if (!selectedFilePath) return

    scrollSelectedTabIntoView(tabListRef.current, selectedTabRef.current)
  }, [selectedFilePath, tabSizing])
  useEditorTabIntentPrefetch({
    enabled: tabPrefetchEnabled,
    tabListRef,
    tabs: editorTabs,
  })

  if (!pane) return null
  if (pane.tabs.length === 0 && visualTabs.length === 0) return null

  function handleSelectTab(tab: EditorTabModel) {
    selectTab(paneId, tab.id)
    requestEditorFocus()
  }

  function handleOpenFile(path: string) {
    selectFile(path)
    requestEditorFocus()
  }

  return (
    <nav
      aria-label='Open files'
      className={cn(
        'flex min-w-0 shrink-0 border-b bg-muted/30',
        tabSizing === 'chrome' ? 'h-[41px]' : 'h-10',
      )}
    >
      <div
        className={cn(
          'app-scrollbar-thin min-w-0 flex-1 overflow-x-auto',
          tabSizing === 'chrome' ? 'relative overflow-y-hidden' : 'flex',
        )}
        ref={tabListRef}
        role='tablist'
        onDragLeave={tabDrag.onDragLeave}
        onDragOver={tabDrag.onDragOver}
        onDrop={tabDrag.onDrop}
      >
        {tabSizing === 'chrome' ? (
          <ChromeEditorTabList
            selectedTabRef={selectedTabRef}
            tabListRef={tabListRef}
            drag={tabDrag}
            tabs={visualTabs}
            onClose={onRequestCloseTab}
            onCloseTabs={onRequestCloseTabs}
            onSplit={splitTab}
            onSelect={handleSelectTab}
          />
        ) : (
          <LegacyEditorTabList
            selectedTabRef={selectedTabRef}
            drag={tabDrag}
            tabSizing={tabSizing}
            tabs={editorTabs}
            onClose={onRequestCloseTab}
            onCloseTabs={onRequestCloseTabs}
            onSplit={splitTab}
            onSelect={handleSelectTab}
          />
        )}
      </div>
      {diffViewMode && onDiffViewModeChange && selectedDiff ? (
        <DiffTabActions
          diffPath={selectedDiff.path}
          mode={diffViewMode}
          onModeChange={onDiffViewModeChange}
          onOpenFile={handleOpenFile}
          onRevealNextChange={onRevealNextChange}
          onRevealPreviousChange={onRevealPreviousChange}
        />
      ) : null}
    </nav>
  )
}
