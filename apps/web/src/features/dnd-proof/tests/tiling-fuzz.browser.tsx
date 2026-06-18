import '@workspace/ui/globals.css'

import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  IDLE_INTERACTION_CONTROLLER,
  InteractionSurface,
  type InteractionController,
} from '@/features/workbench/components/interaction-surface'
import {
  activateProofSurface,
  commitProofLayout,
  createProofScenarioModel,
  dispatchProofLayoutOperation,
  removeProofSurface,
  removeProofWindow,
  type ProofModel,
} from '@/features/dnd-proof/utils/model'
import { checkWorkspaceLayoutInvariants } from '@workspace/tiling/utils/layout-invariants'
import {
  visibleSurfaceIdsInOrder,
  visibleWindowIdsInOrder,
} from '@workspace/tiling/utils/layout-normalize'
import type {
  LayoutOperation,
  SurfaceId,
  WindowId,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

// How many random interactions each seed performs. Bump locally to hammer
// harder; the default keeps a single seed under a minute in CI.
const ACTIONS_PER_SEED = 220
const FUZZ_SEEDS = [1, 2, 3, 4]

let root: Root | null = null
const layoutHandle: { current: WorkspaceLayout | null } = { current: null }
let currentDragPoint: PointerPoint | null = null
let currentPointerId = 0

afterEach(() => {
  if (root) {
    flushSync(() => root?.unmount())
    root = null
  }
  document.body.innerHTML = ''
  document.body.removeAttribute('style')
  layoutHandle.current = null
  currentDragPoint = null
  currentPointerId = 0
})

describe.sequential('tiling drag fuzz', () => {
  for (const seed of FUZZ_SEEDS) {
    it(
      `keeps the layout coherent across ${ACTIONS_PER_SEED} random interactions (seed ${seed})`,
      { timeout: 240_000 },
      async () => {
        renderFuzz()
        await waitForReady()
        await settle()

        const initialIds = [...stateSurfaceIds()].sort()
        expect(initialIds.length).toBeGreaterThan(0)

        const random = mulberry32(seed)
        const history: string[] = []

        for (let step = 0; step < ACTIONS_PER_SEED; step += 1) {
          const label = await runRandomAction(random)
          history.push(`${step}: ${label}`)
          await settle()
          assertHealthy({ history, initialIds, seed, step })
        }
      },
    )
  }
})

// The thin harness mirrors DndProofView's wiring — same real InteractionSurface,
// same proof model reducers — but publishes every committed layout so the test
// can run real invariant checks against the live tree.
function FuzzHarness() {
  const [model, setModel] = useState<ProofModel>(() => createProofScenarioModel(3))
  const controllerRef = useRef<{ current: InteractionController }>({
    current: IDLE_INTERACTION_CONTROLLER,
  })
  layoutHandle.current = model.layout

  function activateSurface(surfaceId: SurfaceId | undefined) {
    if (!surfaceId) return
    controllerRef.current.current.flushPendingCommit()
    setModel((current) => activateProofSurface(current, surfaceId))
  }

  function dispatchLayoutOperation(operation: LayoutOperation) {
    const controller = controllerRef.current.current
    controller.flushPendingCommit()
    if (operation.type !== 'resizeSplit') controller.resetInteraction()
    setModel((current) => dispatchProofLayoutOperation(current, operation))
  }

  function closeSurface(surfaceId: SurfaceId | undefined) {
    if (!surfaceId) return
    const controller = controllerRef.current.current
    controller.flushPendingCommit()
    controller.resetInteraction()
    setModel((current) => removeProofSurface(current, surfaceId))
  }

  function closeWindow(windowId: WindowId | undefined) {
    if (!windowId) return
    const controller = controllerRef.current.current
    controller.flushPendingCommit()
    controller.resetInteraction()
    setModel((current) => removeProofWindow(current, windowId))
  }

  return (
    <InteractionSurface
      ariaLabel='tiling fuzz surface'
      dropZonesVisible={false}
      interactionControllerRef={controllerRef.current}
      layout={model.layout}
      surfaceClassName='bg-muted/20 relative isolate min-h-0 min-w-0 overflow-hidden'
      surfaceDataAttributes={{ 'data-fuzz-surface-area': '' }}
      onCloseSurface={closeSurface}
      onCloseWindow={closeWindow}
      onCommitLayout={(layout, event) => {
        setModel((current) => commitProofLayout(current, layout, event))
      }}
      onDispatchLayoutOperation={dispatchLayoutOperation}
      onSelectSurface={activateSurface}
    />
  )
}

function renderFuzz() {
  document.body.style.margin = '0'
  const container = document.createElement('main')
  container.style.height = '100vh'
  container.style.width = '100vw'
  document.body.append(container)
  root = createRoot(container)
  flushSync(() => root?.render(<FuzzHarness />))
}

async function waitForReady() {
  await vi.waitFor(() => {
    expect(windowElements().length).toBeGreaterThanOrEqual(2)
    expect(tabStrips().length).toBeGreaterThanOrEqual(2)
  })
  await nextFrame()
}

// ---------------------------------------------------------------------------
// Action dispatch
// ---------------------------------------------------------------------------

async function runRandomAction(random: () => number): Promise<string> {
  const action = pick(random, ACTIONS)
  if (!action) return 'noop: no action'

  return action(random)
}

const ACTIONS: ReadonlyArray<(random: () => number) => Promise<string>> = [
  actionDragTabToStrip,
  actionDragTabToWindowBody,
  actionDragTabToRootSnap,
  actionDragWindowToRootSnap,
  actionMergeWindowIntoWindow,
  actionCollapseRow,
  actionCollapseRail,
  actionExpand,
]

async function actionDragTabToStrip(random: () => number): Promise<string> {
  const sourceId = pickTabId(random)
  if (!sourceId) return 'noop: no tab'

  const targetStrip = pick(random, stripsNotContaining(sourceId))
  if (!targetStrip) return 'noop: no foreign strip'

  await dragTabToStripDropZone(sourceId, targetStrip)

  return `dragTabToStrip ${short(sourceId)} -> ${stripId(targetStrip)}`
}

async function actionDragTabToWindowBody(random: () => number): Promise<string> {
  const sourceId = pickTabId(random)
  if (!sourceId) return 'noop: no tab'

  const targetWindow = pick(random, windowsNotContainingTab(sourceId))
  if (!targetWindow) return 'noop: no foreign window'

  await dragTabToWindowBody(sourceId, targetWindow)

  return `dragTabToBody ${short(sourceId)} -> ${windowId(targetWindow)}`
}

async function actionDragTabToRootSnap(random: () => number): Promise<string> {
  const sourceId = pickTabId(random)
  if (!sourceId) return 'noop: no tab'

  const label = pick(random, ROOT_SNAP_LABELS)
  if (!label) return 'noop: no root snap label'

  await dragTabToRootSnap(sourceId, label)

  return `dragTabToRootSnap ${short(sourceId)} -> ${label}`
}

async function actionDragWindowToRootSnap(random: () => number): Promise<string> {
  const sourceWindow = pick(random, windowElements())
  if (!sourceWindow) return 'noop: no window'

  const label = pick(random, ROOT_SNAP_LABELS)
  if (!label) return 'noop: no root snap label'

  await dragWindowToRootSnap(sourceWindow, label)

  return `dragWindowToRootSnap ${windowId(sourceWindow)} -> ${label}`
}

async function actionMergeWindowIntoWindow(random: () => number): Promise<string> {
  const windows = windowElements()
  if (windows.length < 2) return 'noop: <2 windows'

  const sourceWindow = pick(random, windows)
  if (!sourceWindow) return 'noop: no source window'

  const targetWindow = pick(
    random,
    windows.filter((candidate) => candidate !== sourceWindow),
  )
  if (!targetWindow) return 'noop: no target window'

  await dragWindowToWindowBody(sourceWindow, targetWindow)

  return `mergeWindow ${windowId(sourceWindow)} -> ${windowId(targetWindow)}`
}

async function actionCollapseRow(random: () => number): Promise<string> {
  return clickWindowControl(random, ' to row', 'collapseRow')
}

async function actionCollapseRail(random: () => number): Promise<string> {
  return clickWindowControl(random, ' to rail', 'collapseRail')
}

async function actionExpand(random: () => number): Promise<string> {
  const collapsed = windowElements().filter(
    (windowElement) => windowElement.dataset.workbenchWindowMode === 'collapsed',
  )
  const target = pick(random, collapsed)
  if (!target) return 'noop: none collapsed'

  const id = windowId(target)
  const button = windowButtonWithLabelPrefix(target, 'Expand ')
  if (!button) return 'noop: no expand button'

  button.click()
  await settle()

  return `expand ${id}`
}

async function clickWindowControl(
  random: () => number,
  labelText: string,
  name: string,
): Promise<string> {
  const target = pick(
    random,
    windowElements().filter(
      (windowElement) => windowElement.dataset.workbenchWindowMode !== 'collapsed',
    ),
  )
  if (!target) return `noop: ${name} no expanded window`

  const id = windowId(target)
  const button = windowButtonWithLabelIncludes(target, labelText)
  if (!button) return `noop: ${name} no button`

  button.click()
  await settle()

  return `${name} ${id}`
}

// ---------------------------------------------------------------------------
// Drag mechanics (real pointer events through dnd-kit)
// ---------------------------------------------------------------------------

async function dragTabToStripDropZone(tabId: string, targetStrip: HTMLElement) {
  const targetId = stripId(targetStrip)
  const source = proofTab(tabId)
  startPointerDrag(source)
  movePointerBy(8, 0)
  await nextFrame()
  movePointerBy(0, 70)
  await nextFrame()
  const dropPoint = stripDropZonePoint(stripWithId(targetId))
  movePointerTo(dropPoint)
  await holdPointerOver(dropPoint, 3)
  finishPointerDrag(dropPoint)
}

async function dragTabToWindowBody(tabId: string, targetWindow: HTMLElement) {
  const targetId = windowId(targetWindow)
  const source = proofTab(tabId)
  startPointerDrag(source)
  movePointerBy(8, 0)
  await nextFrame()
  movePointerBy(0, 70)
  await nextFrame()
  const bodyPoint = centerOf(windowWithId(targetId))
  movePointerTo(bodyPoint)
  await holdPointerOver(bodyPoint, 3)
  finishPointerDrag(bodyPoint)
}

async function dragTabToRootSnap(tabId: string, label: RootSnapLabel) {
  const source = proofTab(tabId)
  startPointerDrag(source)
  movePointerBy(8, 0)
  await nextFrame()
  movePointerBy(0, 70)
  await nextFrame()
  const point = rootSnapPoint(label)
  movePointerTo(point)
  await holdPointerOver(point, 4)
  finishPointerDrag(point)
}

async function dragWindowToRootSnap(sourceWindow: HTMLElement, label: RootSnapLabel) {
  const handle = windowDragHandle(sourceWindow)
  startPointerDrag(handle)
  movePointerBy(8, 0)
  await nextFrame()
  const point = rootSnapPoint(label)
  movePointerTo(point)
  await holdPointerOver(point, 4)
  finishPointerDrag(point)
}

async function dragWindowToWindowBody(sourceWindow: HTMLElement, targetWindow: HTMLElement) {
  const targetId = windowId(targetWindow)
  const handle = windowDragHandle(sourceWindow)
  startPointerDrag(handle)
  movePointerBy(8, 0)
  await nextFrame()
  const bodyPoint = centerOf(windowWithId(targetId))
  movePointerTo(bodyPoint)
  await holdPointerOver(bodyPoint, 3)
  finishPointerDrag(bodyPoint)
}

// ---------------------------------------------------------------------------
// Invariants — the breakage detector
// ---------------------------------------------------------------------------

function assertHealthy({
  history,
  initialIds,
  seed,
  step,
}: {
  readonly history: readonly string[]
  readonly initialIds: readonly string[]
  readonly seed: number
  readonly step: number
}) {
  const layout = layoutHandle.current
  if (!layout) throw new Error('Fuzz harness never published a layout')

  const failures = collectFailures(layout, initialIds)
  if (failures.length === 0) return

  throw new Error(report({ failures, history, layout, seed, step }))
}

function collectFailures(layout: WorkspaceLayout, initialIds: readonly string[]): string[] {
  const failures: string[] = []

  pushInvariantFailures(layout, failures)
  pushSurfaceSetFailures(layout, initialIds, failures)
  pushDomParityFailures(layout, failures)
  pushTabGeometryFailures(failures)
  pushWindowOverlapFailures(failures)

  return failures
}

// Tiled windows must not stack: two rendered windows overlapping by more than a
// sliver means a window is painted on top of another ("two moved / disappeared").
function pushWindowOverlapFailures(failures: string[]) {
  const rects = windowElements().map((windowElement) => ({
    id: windowElement.dataset.workbenchWindowId ?? '',
    rect: windowElement.getBoundingClientRect(),
  }))

  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i]
      const b = rects[j]
      if (!a || !b) continue

      const overlap = domOverlapArea(a.rect, b.rect)
      const smaller = Math.min(a.rect.width * a.rect.height, b.rect.width * b.rect.height)
      if (smaller <= 0 || overlap <= 0.05 * smaller) continue

      failures.push(
        `windows ${short(a.id)} and ${short(b.id)} overlap ${Math.round(
          (100 * overlap) / smaller,
        )}% of the smaller`,
      )
    }
  }
}

function domOverlapArea(a: DOMRect, b: DOMRect) {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))

  return x * y
}

function pushInvariantFailures(layout: WorkspaceLayout, failures: string[]) {
  const report = checkWorkspaceLayoutInvariants(layout)
  if (report.ok) return

  for (const violation of report.violations) {
    failures.push(`invariant ${violation.code}: ${violation.message}`)
  }
}

function pushSurfaceSetFailures(
  layout: WorkspaceLayout,
  initialIds: readonly string[],
  failures: string[],
) {
  const stateIds = [...stateSurfaceIds(layout)].sort()
  if (sameIds(stateIds, initialIds)) return

  failures.push(
    `surface set changed: expected [${initialIds.map(short).join(', ')}] got [${stateIds
      .map(short)
      .join(', ')}]`,
  )
}

function pushDomParityFailures(layout: WorkspaceLayout, failures: string[]) {
  const domIds = domTabIds()
  if (domIds.length !== new Set(domIds).size) {
    failures.push(`duplicate tabs in DOM: [${domIds.map(short).join(', ')}]`)
  }

  const stateIds = [...stateSurfaceIds(layout)].sort()
  if (!sameIds([...domIds].sort(), stateIds)) {
    failures.push(
      `DOM/state mismatch: dom [${[...domIds].sort().map(short).join(', ')}] vs state [${stateIds
        .map(short)
        .join(', ')}]`,
    )
  }

  const domWindowCount = windowElements().length
  const stateWindowCount = visibleWindowIdsInOrder(layout).length
  if (domWindowCount !== stateWindowCount) {
    failures.push(`window count mismatch: dom ${domWindowCount} vs state ${stateWindowCount}`)
  }
}

function pushTabGeometryFailures(failures: string[]) {
  for (const strip of tabStrips()) {
    if (tabsInStrip(strip).length === 0) {
      failures.push(`empty tab strip ${stripId(strip)}`)
    }
    pushTabsOutsideStripFailures(strip, failures)
  }
}

// The "tabs rendered in the middle of the tab" symptom: a tab painted outside
// the bounds of the strip that owns it.
function pushTabsOutsideStripFailures(strip: HTMLElement, failures: string[]) {
  const stripRect = strip.getBoundingClientRect()
  const scrollable =
    strip.scrollWidth > strip.clientWidth + 1 || strip.scrollHeight > strip.clientHeight + 1
  if (scrollable) return

  for (const tab of tabsInStrip(strip)) {
    const rect = tab.getBoundingClientRect()
    const outside =
      rect.left < stripRect.left - 1 ||
      rect.right > stripRect.right + 1 ||
      rect.top < stripRect.top - 1 ||
      rect.bottom > stripRect.bottom + 1
    if (!outside) continue

    failures.push(
      `tab ${short(tabIdOf(tab))} painted outside strip ${stripId(strip)}` +
        ` (tab ${rectText(rect)} vs strip ${rectText(stripRect)})`,
    )
  }
}

function report({
  failures,
  history,
  layout,
  seed,
  step,
}: {
  readonly failures: readonly string[]
  readonly history: readonly string[]
  readonly layout: WorkspaceLayout
  readonly seed: number
  readonly step: number
}) {
  return [
    `Tiling fuzz broke at seed ${seed}, step ${step}.`,
    '',
    'Failures:',
    ...failures.map((failure) => `  - ${failure}`),
    '',
    'Layout:',
    describeLayout(layout),
    '',
    'Action history (replay deterministically with this seed):',
    ...history.slice(-25).map((entry) => `  ${entry}`),
  ].join('\n')
}

function describeLayout(layout: WorkspaceLayout) {
  const windows = visibleWindowIdsInOrder(layout).map((id) => {
    const window = layout.windowsById[id]
    const surfaces = window?.surfaceIds.map(short).join(', ') ?? ''

    return `  ${short(id)} [${window?.mode ?? '?'}]: ${surfaces}`
  })

  return [`  root=${layout.rootNodeId ? short(layout.rootNodeId) : 'null'}`, ...windows].join('\n')
}

// ---------------------------------------------------------------------------
// DOM + state queries
// ---------------------------------------------------------------------------

function stateSurfaceIds(layout: WorkspaceLayout = requireLayout()) {
  return new Set(visibleSurfaceIdsInOrder(layout))
}

function requireLayout() {
  const layout = layoutHandle.current
  if (!layout) throw new Error('No published layout')

  return layout
}

function windowElements() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-workbench-window-id]'))
}

function windowWithId(id: string) {
  const element = document.querySelector<HTMLElement>(`[data-workbench-window-id="${id}"]`)
  if (!element) throw new Error(`Missing window ${id}`)

  return element
}

function windowId(windowElement: HTMLElement) {
  const id = windowElement.dataset.workbenchWindowId
  if (!id) throw new Error('Missing window id')

  return id
}

function windowsNotContainingTab(tabId: string) {
  return windowElements().filter((windowElement) => {
    const strip = windowElement.querySelector<HTMLElement>('[data-workbench-tab-strip-id]')
    if (!strip) return true

    return !tabIdsInStrip(strip).includes(tabId)
  })
}

function tabStrips() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-workbench-tab-strip-id]'))
}

function stripWithId(id: string) {
  const strip = tabStrips().find((candidate) => candidate.dataset.workbenchTabStripId === id)
  if (!strip) throw new Error(`Missing strip ${id}`)

  return strip
}

function stripId(strip: HTMLElement) {
  const id = strip.dataset.workbenchTabStripId
  if (!id) throw new Error('Missing strip id')

  return id
}

function stripsNotContaining(tabId: string) {
  return tabStrips().filter((strip) => !tabIdsInStrip(strip).includes(tabId))
}

function stripDropZonePoint(strip: HTMLElement): PointerPoint {
  if (strip.dataset.workbenchTabStripOrientation === 'vertical') {
    return elementPointFromRatio(strip, { x: 0.5, y: 0.95 })
  }

  return elementPointFromRatio(strip, { x: 0.98, y: 0.5 })
}

function tabsInStrip(strip: HTMLElement) {
  return Array.from(strip.children).flatMap((child) => {
    if (!(child instanceof HTMLElement)) return []
    if (!child.dataset.workbenchTabId) return []

    return [child]
  })
}

function tabIdsInStrip(strip: HTMLElement) {
  return tabsInStrip(strip).map(tabIdOf)
}

function tabIdOf(tab: HTMLElement) {
  return tab.dataset.workbenchTabId ?? ''
}

function domTabIds() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-workbench-tab-id]')).map(tabIdOf)
}

function proofTab(tabId: string) {
  const tab = Array.from(document.querySelectorAll<HTMLElement>('[data-workbench-tab-id]')).find(
    (candidate) => candidate.dataset.workbenchTabId === tabId,
  )
  if (!tab) throw new Error(`Missing tab ${tabId}`)

  return tab
}

function pickTabId(random: () => number) {
  return pick(random, domTabIds())
}

function windowDragHandle(windowElement: HTMLElement) {
  const handle = windowElement.querySelector<HTMLElement>('[data-workbench-window-drag-handle]')
  if (!handle) throw new Error('Missing window drag handle')

  return handle
}

function windowButtonWithLabelIncludes(windowElement: HTMLElement, text: string) {
  return Array.from(windowElement.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.getAttribute('aria-label')?.includes(text),
  )
}

function windowButtonWithLabelPrefix(windowElement: HTMLElement, prefix: string) {
  return Array.from(windowElement.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.getAttribute('aria-label')?.startsWith(prefix),
  )
}

// ---------------------------------------------------------------------------
// Snap geometry
// ---------------------------------------------------------------------------

type RootSnapLabel = 'root left' | 'root right' | 'root top' | 'root bottom'

const ROOT_SNAP_LABELS: readonly RootSnapLabel[] = [
  'root left',
  'root right',
  'root top',
  'root bottom',
]

function rootSnapPoint(label: RootSnapLabel): PointerPoint {
  const surfaceRect = fuzzSurfaceArea().getBoundingClientRect()
  const midX = surfaceRect.left + surfaceRect.width / 2
  const midY = surfaceRect.top + surfaceRect.height / 2
  if (label === 'root left') return { x: surfaceRect.left + 2, y: midY }
  if (label === 'root right') return { x: surfaceRect.right - 2, y: midY }
  if (label === 'root top') return { x: midX, y: surfaceRect.top + 2 }

  return { x: midX, y: surfaceRect.bottom - 2 }
}

function fuzzSurfaceArea() {
  const area = document.querySelector<HTMLElement>('[data-fuzz-surface-area]')
  if (!area) throw new Error('Missing fuzz surface area')

  return area
}

// ---------------------------------------------------------------------------
// Pointer primitives
// ---------------------------------------------------------------------------

type PointerPoint = {
  readonly x: number
  readonly y: number
}

function startPointerDrag(element: HTMLElement, point: PointerPoint = centerOf(element)) {
  currentDragPoint = point
  currentPointerId += 1
  const target = document.elementFromPoint(point.x, point.y) ?? element
  target.dispatchEvent(pointerEvent('pointerdown', point, 1))
}

function movePointerBy(deltaX: number, deltaY: number) {
  if (!currentDragPoint) throw new Error('Cannot move a pointer before pointerdown')

  movePointerTo({ x: currentDragPoint.x + deltaX, y: currentDragPoint.y + deltaY })
}

function movePointerTo(point: PointerPoint) {
  currentDragPoint = point
  document.dispatchEvent(pointerEvent('pointermove', point, 1))
}

function finishPointerDrag(point: PointerPoint = currentDragPoint ?? { x: 0, y: 0 }) {
  document.dispatchEvent(pointerEvent('pointerup', point, 0))
  currentDragPoint = null
}

async function holdPointerOver(point: PointerPoint, frameCount: number) {
  for (let index = 0; index < frameCount; index += 1) {
    movePointerTo(point)
    await nextFrame()
  }
}

function pointerEvent(type: string, point: PointerPoint, buttons: number) {
  return new PointerEvent(type, {
    bubbles: true,
    button: 0,
    buttons,
    cancelable: true,
    clientX: point.x,
    clientY: point.y,
    isPrimary: true,
    pointerId: currentPointerId,
    pointerType: 'mouse',
  })
}

function centerOf(element: HTMLElement): PointerPoint {
  const rect = element.getBoundingClientRect()

  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

function elementPointFromRatio(element: HTMLElement, ratio: PointerPoint): PointerPoint {
  const rect = element.getBoundingClientRect()

  return { x: rect.left + rect.width * ratio.x, y: rect.top + rect.height * ratio.y }
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

async function settle() {
  // The drag controller commits on a rAF; a handful of frames flushes the
  // commit, the React render, and the geometry pass before we assert.
  for (let index = 0; index < 5; index += 1) {
    await nextFrame()
  }
}

function pick<TItem>(random: () => number, items: readonly TItem[]): TItem | undefined {
  if (items.length === 0) return undefined

  return items[Math.floor(random() * items.length)]
}

function sameIds(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false

  return left.every((id, index) => id === right[index])
}

function short(id: string) {
  const parts = id.split(':')
  if (parts.length <= 2) return id

  return parts.slice(-2).join(':')
}

function rectText(rect: DOMRect) {
  return `${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(
    rect.height,
  )}`
}

// Deterministic PRNG so every failure replays from its seed.
function mulberry32(seed: number) {
  let state = seed >>> 0

  return () => {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
