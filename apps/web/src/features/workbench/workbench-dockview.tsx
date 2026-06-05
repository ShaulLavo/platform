import { useEffect, useMemo, useRef, useState, type DragEvent, type FunctionComponent } from 'react'
import {
  DockviewReact,
  type BuiltInContextMenuItem,
  type DockviewApi,
  type DockviewReadyEvent,
  type GetTabContextMenuItemsParams,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
  type ReactContextMenuItemConfig,
} from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'

import {
  copyTextToClipboard,
  editorTabCloseTargets,
} from '@/components/workspace/editor-tabs/utils/editor-tab-actions-utils'
import {
  editorTabCloseTargetIds,
  type EditorTabCloseTargetKind,
} from '@/components/workspace/editor-tabs/utils/editor-tab-close-targets'
import { EMPTY_GIT_FILES } from '@/components/workspace/editor-tabs/utils/editor-tab-model'
import type { EditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import {
  hasEditorTabDragPayload,
  useEditorTabDrag,
} from '@/components/workspace/editor-tabs/hooks/use-editor-tab-drag'
import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import { useTheme } from '@/components/theme-context'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { useEditorConflictState } from '@/features/editor/state/editor-conflict-state'
import { useEditorDocumentStoreApi } from '@/features/editor/state/editor-document-state'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { useStatus } from '@/features/git/hooks'
import { useWorkspaceFocus } from '@/components/workspace/focus/providers/workspace-focus-state'
import type { EditorKeymapLayer } from '@editor/core'
import { cn } from '@workspace/ui/lib/utils'

import './workbench-dockview.css'
import { WorkbenchDockviewContext } from './workbench-dockview-context'
import {
  syncWorkbenchDockviewPanels,
  workbenchDockviewActivePanelIdForEditorLayout,
  workbenchDockviewPanelRecordsForEditorLayout,
  workbenchDockviewRecordMap,
  type WorkbenchDockviewPanelRecord,
} from './workbench-dockview-model'
import { WorkbenchDockviewPanel } from './workbench-dockview-panel'
import { WorkbenchDockviewTab } from './workbench-dockview-tab'
import {
  workbenchDockviewEditorTabModel,
  workbenchDockviewEditorTabModels,
  workbenchDockviewRecordPath,
  type WorkbenchDockviewTabModelContext,
} from './workbench-dockview-tab-model'
import {
  DEFAULT_WORKBENCH_DOCKVIEW_TAB_PRESENTATION,
  workbenchDockviewTheme,
  workbenchDockviewUsesChromeTabs,
  type WorkbenchDockviewTabPresentation,
} from './workbench-dockview-tabs'
import { WorkbenchDockviewWatermark } from './workbench-dockview-watermark'
import { defaultWorkbenchPanelRegistry, WORKBENCH_DOCKVIEW_COMPONENT } from './workbench-registry'

const dockviewComponents: Record<string, FunctionComponent<IDockviewPanelProps>> = {
  [WORKBENCH_DOCKVIEW_COMPONENT]: WorkbenchDockviewPanel as FunctionComponent<IDockviewPanelProps>,
}

const WorkbenchDockviewDefaultTab =
  WorkbenchDockviewTab as FunctionComponent<IDockviewPanelHeaderProps>

const WORKBENCH_DOCKVIEW_CHROME_TAB_DND_PANE_ID = 'workbench-dockview-chrome-tabs'

export function WorkbenchDockview({
  editorKeymapLayers,
  rootPath,
  tabPresentation = DEFAULT_WORKBENCH_DOCKVIEW_TAB_PRESENTATION,
  onRequestCloseTab,
  onRequestCloseTabs,
}: {
  readonly editorKeymapLayers: readonly EditorKeymapLayer[]
  readonly rootPath: string
  readonly tabPresentation?: WorkbenchDockviewTabPresentation
  readonly onRequestCloseTab: RequestCloseTab
  readonly onRequestCloseTabs: RequestCloseTabs
}) {
  const [api, setApi] = useState<DockviewApi | null>(null)
  const { resolvedTheme } = useTheme()
  const editorPaneLayout = useEditorWorkspaceState((state) => state.editorPaneLayout)
  const conflicts = useEditorConflictState((state) => state.conflicts)
  const documentStore = useEditorDocumentStoreApi()
  const gitStatus = useStatus(rootPath)
  const gitFiles = gitStatus.data?.files ?? EMPTY_GIT_FILES
  const usesChromeTabs = workbenchDockviewUsesChromeTabs(tabPresentation)
  // Dockview treats option object identity as configuration changes.
  const dockviewTheme = useMemo(() => workbenchDockviewTheme({ resolvedTheme }), [resolvedTheme])
  const records = useMemo(
    () => workbenchDockviewPanelRecordsForEditorLayout(editorPaneLayout),
    [editorPaneLayout],
  )
  const activePanelId = useMemo(
    () => workbenchDockviewActivePanelIdForEditorLayout(editorPaneLayout),
    [editorPaneLayout],
  )
  const recordsById = useMemo(() => workbenchDockviewRecordMap(records), [records])
  const recordsRef = useRef<readonly WorkbenchDockviewPanelRecord[]>(records)
  const chromeTabListRef = useRef<HTMLDivElement | null>(null)
  const chromeTabDragItems = useMemo(
    () =>
      records.map((record) => ({
        id: record.tabId,
        path: workbenchDockviewRecordPath(record),
      })),
    [records],
  )
  const tabModelContext = {
    conflicts,
    gitFiles,
    rootPath,
  } satisfies WorkbenchDockviewTabModelContext
  const tabModelContextRef = useRef(tabModelContext)
  const { reorderTab, selectTab, splitTab } = useEditorCommands()
  const setFocusArea = useWorkspaceFocus((state) => state.setFocusArea)
  const chromeTabDrag = useEditorTabDrag({
    paneId: WORKBENCH_DOCKVIEW_CHROME_TAB_DND_PANE_ID,
    tabListRef: chromeTabListRef,
    tabs: chromeTabDragItems,
    onMoveToPane: (tabId, targetIndex) =>
      reorderWorkbenchDockviewChromeTab({
        api,
        records: recordsRef.current,
        reorderTab,
        tabId,
        targetIndex,
      }),
    onReorder: (tabId, targetIndex) =>
      reorderWorkbenchDockviewChromeTab({
        api,
        records: recordsRef.current,
        reorderTab,
        tabId,
        targetIndex,
      }),
  })
  const defaultTabComponent = usesChromeTabs ? WorkbenchDockviewDefaultTab : undefined
  const tabContextMenuItems = usesChromeTabs ? getTabContextMenuItems : undefined
  const scrollbars = usesChromeTabs ? 'native' : undefined
  const chromeTabDragContext = usesChromeTabs
    ? {
        controller: chromeTabDrag,
        setTabListElement: (element: HTMLDivElement | null) => {
          chromeTabListRef.current = element
        },
        tabs: chromeTabDragItems,
      }
    : null

  recordsRef.current = records
  tabModelContextRef.current = tabModelContext

  useEffect(() => {
    if (!api) return

    syncWorkbenchDockviewPanels({
      activePanelId,
      api,
      records,
      registry: defaultWorkbenchPanelRegistry,
    })
  }, [activePanelId, api, records])

  useEffect(() => {
    if (!api) return

    const disposable = api.onDidActivePanelChange((panel) => {
      const record = findRecord(recordsRef.current, panel?.id ?? null)
      if (!record) return

      setFocusArea('editor')
      selectTab(record.paneId, record.tabId)
    })

    return () => disposable.dispose()
  }, [api, selectTab, setFocusArea])

  function handleReady(event: DockviewReadyEvent) {
    setApi(event.api)
  }

  function getTabContextMenuItems({
    panel,
  }: GetTabContextMenuItemsParams): (BuiltInContextMenuItem | ReactContextMenuItemConfig)[] {
    return workbenchDockviewTabContextMenuItems(panel.id, recordsRef.current, {
      context: tabModelContextRef.current,
      dirtyFilePaths: documentStore.getState().dirtyFilePaths,
      requestCloseTab: onRequestCloseTab,
      requestCloseTabs: onRequestCloseTabs,
      splitTab,
    })
  }

  function handleChromeTabDragOver(event: DragEvent<HTMLElement>) {
    if (!usesChromeTabs) return
    if (!syncChromeTabDragContainer(event)) return
    if (!hasEditorTabDragPayload(event.dataTransfer)) return

    event.stopPropagation()
    chromeTabDrag.onDragOver(event)
  }

  function handleChromeTabDrop(event: DragEvent<HTMLElement>) {
    if (!usesChromeTabs) return
    if (!syncChromeTabDragContainer(event)) return
    if (!hasEditorTabDragPayload(event.dataTransfer)) return

    event.stopPropagation()
    chromeTabDrag.onDrop(event)
  }

  function handleChromeTabDragLeave(event: DragEvent<HTMLElement>) {
    if (!usesChromeTabs) return
    if (!syncChromeTabDragContainer(event)) return
    if (!hasEditorTabDragPayload(event.dataTransfer)) return

    event.stopPropagation()
    chromeTabDrag.onDragLeave(event)
  }

  function syncChromeTabDragContainer(event: DragEvent<HTMLElement>) {
    const target = event.target
    if (!(target instanceof Element)) return false

    const tabList = target.closest<HTMLDivElement>('.dv-tabs-container')
    if (!tabList) return false

    chromeTabListRef.current = tabList
    return true
  }

  return (
    <WorkbenchDockviewContext
      value={{
        chromeTabDrag: chromeTabDragContext,
        conflicts,
        editorKeymapLayers,
        gitFiles,
        recordsById,
        requestCloseTab: onRequestCloseTab,
        requestCloseTabs: onRequestCloseTabs,
        rootPath,
      }}
    >
      <section
        className={cn('workbench-dockview', `workbench-dockview--tabs-${tabPresentation}`)}
        data-tab-presentation={tabPresentation}
        data-theme={resolvedTheme}
        onDragLeaveCapture={handleChromeTabDragLeave}
        onDragOverCapture={handleChromeTabDragOver}
        onDropCapture={handleChromeTabDrop}
      >
        <DockviewReact
          components={dockviewComponents}
          defaultRenderer='always'
          defaultTabComponent={defaultTabComponent}
          disableTabsOverflowList={usesChromeTabs ? true : undefined}
          disableFloatingGroups
          getTabContextMenuItems={tabContextMenuItems}
          noPanelsOverlay='watermark'
          scrollbars={scrollbars}
          theme={dockviewTheme}
          watermarkComponent={WorkbenchDockviewWatermark}
          onReady={handleReady}
        />
      </section>
    </WorkbenchDockviewContext>
  )
}

function reorderWorkbenchDockviewChromeTab({
  api,
  records,
  reorderTab,
  tabId,
  targetIndex,
}: {
  readonly api: DockviewApi | null
  readonly records: readonly WorkbenchDockviewPanelRecord[]
  readonly reorderTab: ReturnType<typeof useEditorCommands>['reorderTab']
  readonly tabId: string
  readonly targetIndex: number
}) {
  const record = records.find((item) => item.tabId === tabId)
  if (!record) return false

  const changed = reorderTab(record.paneId, record.tabId, targetIndex)
  if (changed) moveDockviewPanelWithinTabGroup(api, record.panel.id, targetIndex)

  return changed
}

function moveDockviewPanelWithinTabGroup(
  api: DockviewApi | null,
  panelId: string,
  targetIndex: number,
) {
  const panel = api?.getPanel(panelId)
  const tabGroup = panel?.api.group.model
    .getTabGroups()
    .find((group) => group.panelIds.includes(panelId))
  if (!panel || !tabGroup) return

  panel.api.group.model.movePanelWithinGroup(tabGroup.id, panelId, targetIndex)
}

function findRecord(records: readonly WorkbenchDockviewPanelRecord[], panelId: string | null) {
  if (!panelId) return null

  return records.find((record) => record.panel.id === panelId) ?? null
}

function workbenchDockviewTabContextMenuItems(
  panelId: string,
  records: readonly WorkbenchDockviewPanelRecord[],
  {
    context,
    dirtyFilePaths,
    requestCloseTab,
    requestCloseTabs,
    splitTab,
  }: {
    readonly context: WorkbenchDockviewTabModelContext
    readonly dirtyFilePaths: ReadonlySet<string>
    readonly requestCloseTab: RequestCloseTab
    readonly requestCloseTabs: RequestCloseTabs
    readonly splitTab: ReturnType<typeof useEditorCommands>['splitTab']
  },
): (BuiltInContextMenuItem | ReactContextMenuItemConfig)[] {
  const record = findRecord(records, panelId)
  if (!record) return []

  const tabs = workbenchDockviewEditorTabModels({
    activeTabId: record.tabId,
    context,
    records,
  })
  const tab = workbenchDockviewEditorTabModel({
    active: true,
    context,
    record,
  })

  return [
    {
      action: () => requestCloseTab(record.tabId),
      label: 'Close',
    },
    {
      action: () => requestCloseTarget('closeOthers', tab, tabs, dirtyFilePaths, requestCloseTabs),
      disabled: closeTargetCount('closeOthers', tab, tabs, dirtyFilePaths) === 0,
      label: 'Close Others',
    },
    {
      action: () => requestCloseTarget('closeToRight', tab, tabs, dirtyFilePaths, requestCloseTabs),
      disabled: closeTargetCount('closeToRight', tab, tabs, dirtyFilePaths) === 0,
      label: 'Close to the Right',
    },
    {
      action: () => requestCloseTarget('closeSaved', tab, tabs, dirtyFilePaths, requestCloseTabs),
      disabled: closeTargetCount('closeSaved', tab, tabs, dirtyFilePaths) === 0,
      label: 'Close Saved',
    },
    {
      action: () => requestCloseTarget('closeAll', tab, tabs, dirtyFilePaths, requestCloseTabs),
      label: 'Close All',
    },
    'separator',
    {
      action: () => splitTab(record.tabId, 'horizontal'),
      label: 'Split Right',
    },
    {
      action: () => splitTab(record.tabId, 'vertical'),
      label: 'Split Down',
    },
    'separator',
    {
      action: () => void copyTextToClipboard(tab.copyPath, 'path'),
      label: 'Copy Path',
    },
    {
      action: () => void copyTextToClipboard(tab.copyRelativePath, 'relative path'),
      label: 'Copy Relative Path',
    },
  ]
}

function requestCloseTarget(
  kind: EditorTabCloseTargetKind,
  tab: EditorTabModel,
  tabs: readonly EditorTabModel[],
  dirtyFilePaths: ReadonlySet<string>,
  requestCloseTabs: RequestCloseTabs,
) {
  const tabIds = closeTargetIds(kind, tab, tabs, dirtyFilePaths)
  if (tabIds.length === 0) return

  requestCloseTabs(tabIds)
}

function closeTargetCount(
  kind: EditorTabCloseTargetKind,
  tab: EditorTabModel,
  tabs: readonly EditorTabModel[],
  dirtyFilePaths: ReadonlySet<string>,
) {
  return closeTargetIds(kind, tab, tabs, dirtyFilePaths).length
}

function closeTargetIds(
  kind: EditorTabCloseTargetKind,
  tab: EditorTabModel,
  tabs: readonly EditorTabModel[],
  dirtyFilePaths: ReadonlySet<string>,
) {
  return editorTabCloseTargetIds(editorTabCloseTargets(tabs, dirtyFilePaths), tab.id, kind)
}
