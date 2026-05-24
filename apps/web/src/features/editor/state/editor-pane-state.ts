export type EditorPaneSplitDirection = 'horizontal' | 'vertical'

export type EditorPaneTab = {
  id: string
  path: string
}

export type EditorPaneLeaf = {
  activeTabId: string | null
  id: string
  kind: 'leaf'
  tabs: EditorPaneTab[]
}

export type EditorPaneSplit = {
  children: EditorPaneNode[]
  direction: EditorPaneSplitDirection
  id: string
  kind: 'split'
  sizes: number[]
}

export type EditorPaneNode = EditorPaneLeaf | EditorPaneSplit

export type EditorPaneLayout = {
  activePaneId: string
  root: EditorPaneNode
}

export type EditorPaneDropZone = 'bottom' | 'center' | 'left' | 'right' | 'top'
export type EditorPaneSplitScope = 'pane' | 'root'

export type EditorPaneTabLocation = {
  pane: EditorPaneLeaf
  tab: EditorPaneTab
}

type IdKind = 'pane' | 'split' | 'tab'

export const MAX_EDITOR_PANE_SPLIT_DEPTH = 2

let nextEditorPaneStateId = 1
const editorPaneStateIdPrefix = Math.random().toString(36).slice(2, 8)

export function createEmptyEditorPaneLayout(): EditorPaneLayout {
  const pane = createEditorPaneLeaf([])
  return {
    activePaneId: pane.id,
    root: pane,
  }
}

export function createEditorPaneLayoutForPaths(
  paths: readonly string[],
  activePath: string | null,
): EditorPaneLayout {
  const tabs = uniquePaths(paths).map(createEditorPaneTab)
  const activeTabId = tabs.find((tab) => tab.path === activePath)?.id ?? tabs.at(0)?.id ?? null
  const pane = createEditorPaneLeaf(tabs, activeTabId)
  return {
    activePaneId: pane.id,
    root: pane,
  }
}

export function createEditorPaneTab(path: string): EditorPaneTab {
  return {
    id: createEditorPaneStateId('tab'),
    path,
  }
}

export function activeEditorPanePath(layout: EditorPaneLayout) {
  return activeEditorPaneTab(layout)?.path ?? null
}

export function activeEditorPaneTab(layout: EditorPaneLayout) {
  const pane = findEditorPane(layout.root, layout.activePaneId)
  if (!pane) return null

  return activeTabForPane(pane)
}

export function editorPaneOpenPaths(layout: EditorPaneLayout) {
  return uniquePaths(editorPaneTabs(layout.root).map((tab) => tab.path))
}

export function editorPaneTabs(node: EditorPaneNode): EditorPaneTab[] {
  if (node.kind === 'leaf') return node.tabs

  return node.children.flatMap(editorPaneTabs)
}

export function editorPaneLeaves(node: EditorPaneNode): EditorPaneLeaf[] {
  if (node.kind === 'leaf') return [node]

  return node.children.flatMap(editorPaneLeaves)
}

export function findEditorPane(node: EditorPaneNode, paneId: string): EditorPaneLeaf | null {
  if (node.kind === 'leaf') return node.id === paneId ? node : null

  for (const child of node.children) {
    const pane = findEditorPane(child, paneId)
    if (pane) return pane
  }

  return null
}

export function findEditorPaneTab(
  node: EditorPaneNode,
  tabId: string,
): EditorPaneTabLocation | null {
  if (node.kind === 'leaf') return findEditorPaneLeafTab(node, tabId)

  for (const child of node.children) {
    const location = findEditorPaneTab(child, tabId)
    if (location) return location
  }

  return null
}

export function openEditorPathInActivePane(
  layout: EditorPaneLayout,
  path: string,
): EditorPaneLayout {
  const activePane = findEditorPane(layout.root, layout.activePaneId)
  const paneId = activePane?.id ?? firstEditorPane(layout.root)?.id
  if (!paneId) return createEditorPaneLayoutForPaths([path], path)

  const existing = activePane?.tabs.find((tab) => tab.path === path)
  if (existing) return selectEditorPaneTab(layout, paneId, existing.id)

  const tab = createEditorPaneTab(path)
  return normalizeEditorPaneLayout({
    activePaneId: paneId,
    root: updateEditorPaneLeaf(layout.root, paneId, (pane) => ({
      ...pane,
      activeTabId: tab.id,
      tabs: pane.tabs.concat(tab),
    })),
  })
}

export function selectEditorPaneTab(
  layout: EditorPaneLayout,
  paneId: string,
  tabId: string,
): EditorPaneLayout {
  const pane = findEditorPane(layout.root, paneId)
  if (!pane?.tabs.some((tab) => tab.id === tabId)) return layout

  return normalizeEditorPaneLayout({
    activePaneId: paneId,
    root: updateEditorPaneLeaf(layout.root, paneId, (leaf) => ({
      ...leaf,
      activeTabId: tabId,
    })),
  })
}

export function setActiveEditorPane(layout: EditorPaneLayout, paneId: string): EditorPaneLayout {
  if (!findEditorPane(layout.root, paneId)) return layout

  return {
    ...layout,
    activePaneId: paneId,
  }
}

export function reorderEditorPaneTab(
  layout: EditorPaneLayout,
  paneId: string,
  tabId: string,
  targetIndex: number,
): EditorPaneLayout {
  const pane = findEditorPane(layout.root, paneId)
  if (!pane?.tabs.some((tab) => tab.id === tabId)) return layout

  const tabs = reorderTabs(pane.tabs, tabId, targetIndex)
  if (sameTabOrder(pane.tabs, tabs)) return layout

  return {
    activePaneId: paneId,
    root: updateEditorPaneLeaf(layout.root, paneId, (leaf) => ({
      ...leaf,
      tabs,
    })),
  }
}

export function closeEditorPaneTabs(
  layout: EditorPaneLayout,
  tabIds: readonly string[],
): EditorPaneLayout {
  const closing = new Set(tabIds)
  if (closing.size === 0) return layout

  const root = removeTabsFromEditorPaneNode(layout.root, closing)
  return normalizeEditorPaneLayout({
    activePaneId: layout.activePaneId,
    root: root ?? createEditorPaneLeaf([]),
  })
}

export function removeEditorPanePath(layout: EditorPaneLayout, path: string): EditorPaneLayout {
  const tabIds = editorPaneTabs(layout.root)
    .filter((tab) => tab.path === path)
    .map((tab) => tab.id)
  return closeEditorPaneTabs(layout, tabIds)
}

export function filterEditorPaneLayoutTabs(
  layout: EditorPaneLayout,
  predicate: (tab: EditorPaneTab) => boolean,
): EditorPaneLayout {
  const tabIds = editorPaneTabs(layout.root)
    .filter((tab) => !predicate(tab))
    .map((tab) => tab.id)
  return closeEditorPaneTabs(layout, tabIds)
}

export function renameEditorPanePath(
  layout: EditorPaneLayout,
  from: string,
  to: string,
): EditorPaneLayout {
  return normalizeEditorPaneLayout({
    activePaneId: layout.activePaneId,
    root: mapEditorPaneTabs(layout.root, (tab) => (tab.path === from ? { ...tab, path: to } : tab)),
  })
}

export function splitEditorPaneTab(
  layout: EditorPaneLayout,
  tabId: string,
  direction: EditorPaneSplitDirection,
  placement: 'after' | 'before' = 'after',
): EditorPaneLayout {
  const location = findEditorPaneTab(layout.root, tabId)
  if (!location) return layout

  return moveEditorPaneTabToSplit(layout, {
    sourceTabId: tabId,
    targetPaneId: location.pane.id,
    zone: direction === 'horizontal' ? 'right' : 'bottom',
    placement,
  })
}

export function moveEditorPaneTabToPane(
  layout: EditorPaneLayout,
  tabId: string,
  targetPaneId: string,
  targetIndex?: number,
): EditorPaneLayout {
  const location = findEditorPaneTab(layout.root, tabId)
  const targetPane = findEditorPane(layout.root, targetPaneId)
  if (!location || !targetPane) return layout
  if (location.pane.id === targetPane.id) {
    if (targetIndex === undefined) return layout

    return reorderEditorPaneTab(layout, targetPaneId, tabId, targetIndex ?? 0)
  }

  const tab = location.tab
  const withoutSource = removeTabsFromEditorPaneNode(layout.root, new Set([tabId]))
  const nextRoot = insertTabIntoPane(
    withoutSource ?? createEditorPaneLeaf([]),
    targetPaneId,
    tab,
    targetIndex,
  )

  return normalizeEditorPaneLayout({
    activePaneId: targetPaneId,
    root: nextRoot,
  })
}

export function moveEditorPaneTabToSplit(
  layout: EditorPaneLayout,
  {
    placement = 'after',
    scope = 'pane',
    sourceTabId,
    targetPaneId,
    zone,
  }: {
    placement?: 'after' | 'before'
    scope?: EditorPaneSplitScope
    sourceTabId: string
    targetPaneId: string
    zone: Exclude<EditorPaneDropZone, 'center'>
  },
): EditorPaneLayout {
  const location = findEditorPaneTab(layout.root, sourceTabId)
  const targetPane = findEditorPane(layout.root, targetPaneId)
  if (!location || !targetPane) return layout

  const tab = location.tab
  const withoutSource = removeTabsFromEditorPaneNode(layout.root, new Set([sourceTabId]))
  const splitTargetPaneId =
    withoutSource && findEditorPane(withoutSource, targetPaneId)
      ? targetPaneId
      : firstEditorPane(withoutSource ?? createEditorPaneLeaf([]))?.id
  if (!withoutSource || !splitTargetPaneId) {
    return createLayoutForSingleMovedTab(tab)
  }

  const direction = dropZoneSplitDirection(zone)
  const before = placement === 'before' || zone === 'left' || zone === 'top'
  const nextPane = createEditorPaneLeaf([tab], tab.id)
  const nextRoot =
    scope === 'root'
      ? createSplitForNode(withoutSource, {
          before,
          direction,
          pane: nextPane,
        })
      : splitPaneNode(withoutSource, splitTargetPaneId, {
          before,
          direction,
          pane: nextPane,
        })

  if (editorPaneSplitDepth(nextRoot) > MAX_EDITOR_PANE_SPLIT_DEPTH) {
    return layout
  }

  return normalizeEditorPaneLayout({
    activePaneId: nextPane.id,
    root: nextRoot,
  })
}

export function updateEditorPaneSplitSizes(
  layout: EditorPaneLayout,
  splitId: string,
  sizes: readonly number[],
): EditorPaneLayout {
  return {
    ...layout,
    root: updateEditorPaneSplit(layout.root, splitId, (split) => ({
      ...split,
      sizes: normalizeSizes(sizes, split.children.length),
    })),
  }
}

export function normalizeEditorPaneLayout(layout: EditorPaneLayout): EditorPaneLayout {
  const normalizedRoot = normalizeEditorPaneNode(layout.root)
  const root = dedupeEditorPaneIds(normalizedRoot ?? createEditorPaneLeaf([]))
  const activePaneId = normalizedActivePaneId(root, layout.activePaneId)

  return {
    activePaneId,
    root,
  }
}

export function activeTabForPane(pane: EditorPaneLeaf) {
  return pane.tabs.find((tab) => tab.id === pane.activeTabId) ?? pane.tabs.at(0) ?? null
}

export function canSplitEditorPaneAtPane(layout: EditorPaneLayout, paneId: string) {
  const depth = editorPaneLeafSplitDepth(layout.root, paneId)
  if (depth === null) return false

  return depth < MAX_EDITOR_PANE_SPLIT_DEPTH
}

export function canSplitEditorPaneAtRoot(layout: EditorPaneLayout) {
  return editorPaneSplitDepth(layout.root) < MAX_EDITOR_PANE_SPLIT_DEPTH
}

export function editorPaneSplitDepth(node: EditorPaneNode): number {
  if (node.kind === 'leaf') return 0

  return 1 + Math.max(0, ...node.children.map(editorPaneSplitDepth))
}

export function editorPanePathCounts(layout: EditorPaneLayout) {
  const counts = new Map<string, number>()
  for (const tab of editorPaneTabs(layout.root)) {
    counts.set(tab.path, (counts.get(tab.path) ?? 0) + 1)
  }
  return counts
}

function createEditorPaneLeaf(
  tabs: readonly EditorPaneTab[],
  activeTabId: string | null = tabs.at(0)?.id ?? null,
): EditorPaneLeaf {
  return {
    activeTabId,
    id: createEditorPaneStateId('pane'),
    kind: 'leaf',
    tabs: Array.from(tabs),
  }
}

function createLayoutForSingleMovedTab(tab: EditorPaneTab): EditorPaneLayout {
  const pane = createEditorPaneLeaf([tab], tab.id)
  return {
    activePaneId: pane.id,
    root: pane,
  }
}

function createEditorPaneStateId(kind: IdKind) {
  const id = `${kind}-${editorPaneStateIdPrefix}-${nextEditorPaneStateId.toString(36)}`
  nextEditorPaneStateId += 1
  return id
}

function dedupeEditorPaneIds(root: EditorPaneNode): EditorPaneNode {
  return dedupeEditorPaneNodeIds(root, new Set(), new Set())
}

function dedupeEditorPaneNodeIds(
  node: EditorPaneNode,
  usedNodeIds: Set<string>,
  usedTabIds: Set<string>,
): EditorPaneNode {
  const id = uniqueEditorPaneId(node.id, node.kind === 'leaf' ? 'pane' : 'split', usedNodeIds)
  if (node.kind === 'leaf') {
    return dedupeEditorPaneLeafIds(node, id, usedTabIds)
  }

  return {
    ...node,
    children: node.children.map((child) => dedupeEditorPaneNodeIds(child, usedNodeIds, usedTabIds)),
    id,
  }
}

function dedupeEditorPaneLeafIds(
  pane: EditorPaneLeaf,
  id: string,
  usedTabIds: Set<string>,
): EditorPaneLeaf {
  let activeTabId = pane.activeTabId
  let matchedActiveTab = false
  const tabs = pane.tabs.map((tab) => {
    const tabId = uniqueEditorPaneId(tab.id, 'tab', usedTabIds)
    if (tab.id === pane.activeTabId && !matchedActiveTab) {
      activeTabId = tabId
      matchedActiveTab = true
    }

    return tabId === tab.id ? tab : { ...tab, id: tabId }
  })

  if (!tabs.some((tab) => tab.id === activeTabId)) {
    activeTabId = tabs.at(0)?.id ?? null
  }

  return {
    ...pane,
    activeTabId,
    id,
    tabs,
  }
}

function uniqueEditorPaneId(id: string, kind: IdKind, usedIds: Set<string>) {
  if (!usedIds.has(id)) {
    usedIds.add(id)
    return id
  }

  return createUnusedEditorPaneId(kind, usedIds)
}

function createUnusedEditorPaneId(kind: IdKind, usedIds: Set<string>) {
  let id = createEditorPaneStateId(kind)
  while (usedIds.has(id)) {
    id = createEditorPaneStateId(kind)
  }
  usedIds.add(id)
  return id
}

function uniquePaths(paths: readonly string[]) {
  return Array.from(new Set(paths))
}

function firstEditorPane(node: EditorPaneNode): EditorPaneLeaf | null {
  if (node.kind === 'leaf') return node

  for (const child of node.children) {
    const pane = firstEditorPane(child)
    if (pane) return pane
  }

  return null
}

function findEditorPaneLeafTab(pane: EditorPaneLeaf, tabId: string): EditorPaneTabLocation | null {
  const tab = pane.tabs.find((candidate) => candidate.id === tabId)
  if (!tab) return null

  return { pane, tab }
}

function updateEditorPaneLeaf(
  node: EditorPaneNode,
  paneId: string,
  update: (pane: EditorPaneLeaf) => EditorPaneLeaf,
): EditorPaneNode {
  if (node.kind === 'leaf') return node.id === paneId ? update(node) : node

  return {
    ...node,
    children: node.children.map((child) => updateEditorPaneLeaf(child, paneId, update)),
  }
}

function updateEditorPaneSplit(
  node: EditorPaneNode,
  splitId: string,
  update: (split: EditorPaneSplit) => EditorPaneSplit,
): EditorPaneNode {
  if (node.kind === 'leaf') return node
  if (node.id === splitId) return update(node)

  return {
    ...node,
    children: node.children.map((child) => updateEditorPaneSplit(child, splitId, update)),
  }
}

function mapEditorPaneTabs(
  node: EditorPaneNode,
  mapTab: (tab: EditorPaneTab) => EditorPaneTab,
): EditorPaneNode {
  if (node.kind === 'leaf') {
    return {
      ...node,
      tabs: node.tabs.map(mapTab),
    }
  }

  return {
    ...node,
    children: node.children.map((child) => mapEditorPaneTabs(child, mapTab)),
  }
}

function reorderTabs(
  tabs: readonly EditorPaneTab[],
  tabId: string,
  targetIndex: number,
): EditorPaneTab[] {
  const sourceIndex = tabs.findIndex((tab) => tab.id === tabId)
  if (sourceIndex === -1) return Array.from(tabs)

  const nextTabs = tabs.filter((tab) => tab.id !== tabId)
  const index = Math.max(0, Math.min(nextTabs.length, Math.trunc(targetIndex)))
  const tab = tabs[sourceIndex]
  if (!tab) return Array.from(tabs)

  nextTabs.splice(index, 0, tab)
  return nextTabs
}

function sameTabOrder(left: readonly EditorPaneTab[], right: readonly EditorPaneTab[]) {
  if (left.length !== right.length) return false

  return left.every((tab, index) => tab.id === right[index]?.id)
}

function removeTabsFromEditorPaneNode(
  node: EditorPaneNode,
  tabIds: ReadonlySet<string>,
): EditorPaneNode | null {
  if (node.kind === 'leaf') return removeTabsFromEditorPaneLeaf(node, tabIds)

  const children = node.children.flatMap((child) => {
    const nextChild = removeTabsFromEditorPaneNode(child, tabIds)
    return nextChild ? [nextChild] : []
  })
  if (children.length === 0) return null

  return {
    ...node,
    children,
    sizes: normalizeSizes(node.sizes, children.length),
  }
}

function removeTabsFromEditorPaneLeaf(
  pane: EditorPaneLeaf,
  tabIds: ReadonlySet<string>,
): EditorPaneLeaf | null {
  const tabs = pane.tabs.filter((tab) => !tabIds.has(tab.id))
  if (tabs.length === 0) return null
  if (!tabIds.has(pane.activeTabId ?? '')) return { ...pane, tabs }

  return {
    ...pane,
    activeTabId: tabs.at(0)?.id ?? null,
    tabs,
  }
}

function insertTabIntoPane(
  node: EditorPaneNode,
  paneId: string,
  tab: EditorPaneTab,
  targetIndex?: number,
): EditorPaneNode {
  return updateEditorPaneLeaf(node, paneId, (pane) => ({
    ...pane,
    activeTabId: tab.id,
    tabs: insertTabAtIndex(pane.tabs, tab, targetIndex),
  }))
}

function insertTabAtIndex(
  tabs: readonly EditorPaneTab[],
  tab: EditorPaneTab,
  targetIndex?: number,
) {
  const nextTabs = Array.from(tabs)
  const index =
    targetIndex === undefined
      ? nextTabs.length
      : Math.max(0, Math.min(nextTabs.length, Math.trunc(targetIndex)))
  nextTabs.splice(index, 0, tab)
  return nextTabs
}

function splitPaneNode(
  node: EditorPaneNode,
  targetPaneId: string,
  options: {
    before: boolean
    direction: EditorPaneSplitDirection
    pane: EditorPaneLeaf
  },
): EditorPaneNode {
  if (node.kind === 'leaf') {
    if (node.id !== targetPaneId) return node

    return createSplitForNode(node, options)
  }

  return {
    ...node,
    children: node.children.map((child) => splitPaneNode(child, targetPaneId, options)),
  }
}

function createSplitForNode(
  target: EditorPaneNode,
  {
    before,
    direction,
    pane,
  }: {
    before: boolean
    direction: EditorPaneSplitDirection
    pane: EditorPaneLeaf
  },
): EditorPaneSplit {
  const children = before ? [pane, target] : [target, pane]
  return {
    children,
    direction,
    id: createEditorPaneStateId('split'),
    kind: 'split',
    sizes: normalizeSizes([], children.length),
  }
}

function normalizeEditorPaneNode(node: EditorPaneNode, depth = 0): EditorPaneNode | null {
  if (node.kind === 'leaf') return node.tabs.length > 0 ? node : null
  if (depth >= MAX_EDITOR_PANE_SPLIT_DEPTH) {
    const tabs = editorPaneTabs(node)
    return tabs.length > 0 ? createEditorPaneLeaf(tabs) : null
  }

  const children = normalizedSplitChildren(node, depth)
  if (children.length === 0) return null
  if (children.length === 1) return children[0] ?? null

  return {
    ...node,
    children,
    sizes: normalizeSizes(node.sizes, children.length),
  }
}

function normalizedSplitChildren(node: EditorPaneSplit, depth: number) {
  const children: EditorPaneNode[] = []
  for (const child of node.children) {
    const normalized = normalizeEditorPaneNode(child, depth + 1)
    if (!normalized) continue
    if (normalized.kind !== 'split' || normalized.direction !== node.direction) {
      children.push(normalized)
      continue
    }

    children.push(...normalized.children)
  }

  return children
}

function normalizedActivePaneId(root: EditorPaneNode, activePaneId: string) {
  if (findEditorPane(root, activePaneId)) return activePaneId

  return firstEditorPane(root)?.id ?? activePaneId
}

function editorPaneLeafSplitDepth(node: EditorPaneNode, paneId: string, depth = 0): number | null {
  if (node.kind === 'leaf') return node.id === paneId ? depth : null

  for (const child of node.children) {
    const childDepth = editorPaneLeafSplitDepth(child, paneId, depth + 1)
    if (childDepth !== null) return childDepth
  }

  return null
}

function normalizeSizes(sizes: readonly number[], count: number) {
  if (count <= 0) return []
  if (sizes.length !== count) return equalSizes(count)

  const total = sizes.reduce((sum, size) => sum + finitePanelSize(size), 0)
  if (total <= 0) return equalSizes(count)

  return sizes.map((size) => (finitePanelSize(size) / total) * 100)
}

function finitePanelSize(size: number) {
  if (!Number.isFinite(size)) return 0

  return Math.max(0, size)
}

function equalSizes(count: number) {
  return Array.from({ length: count }, () => 100 / count)
}

function dropZoneSplitDirection(
  zone: Exclude<EditorPaneDropZone, 'center'>,
): EditorPaneSplitDirection {
  if (zone === 'left' || zone === 'right') return 'horizontal'

  return 'vertical'
}
