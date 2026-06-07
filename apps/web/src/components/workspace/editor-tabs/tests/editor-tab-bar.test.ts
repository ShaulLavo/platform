import { describe, expect, it } from 'vitest'

import { editorTabCloseTargetIds } from '@/components/workspace/editor-tabs/utils/editor-tab-close-targets'
import {
  cachedChromeTabCloseLayoutSnapshot,
  cacheChromeTabCloseLayoutSnapshot,
  chromeTabCloseModeAvailableWidth,
  chromeTabCloseLayoutSnapshot,
  chromeTabCloseLayoutWidth,
  hasClosingChromeTabs,
  promotedChromeTabIdAfterClose,
} from '@/components/workspace/editor-tabs/utils/editor-tab-close-layout'
import {
  chromeTabCloseBurstTargetId,
  chromeTabCloseTargetAfterClosingTab,
} from '@/components/workspace/editor-tabs/utils/editor-tab-close-retarget'
import { chromeTabStyle } from '@/components/workspace/editor-tabs/utils/editor-tab-style-utils'
import {
  chromeVisualTabsInitialState,
  chromeVisualTabsReducer,
  primeChromeVisualTabsCache,
  syncChromeVisualTabs,
  type ChromeVisualTabsState,
} from '@/components/workspace/editor-tabs/hooks/use-chrome-visual-tabs'
import {
  EDITOR_TAB_DETACH_HYSTERESIS_PX,
  EDITOR_TAB_DRAG_MIME,
  EDITOR_TAB_MOUSE_DETACH_THRESHOLD_PX,
  EDITOR_TAB_TOUCH_DETACH_THRESHOLD_PX,
  editorTabDetachState,
  editorTabDragReducer,
  editorTabInsertionEdge,
  hasEditorTabDragPayload,
} from '@/components/workspace/editor-tabs/hooks/use-editor-tab-drag'
import {
  editorTabDropIndex,
  type EditorTabDropTargetBounds,
} from '@/components/workspace/editor-tabs/utils/editor-tab-dnd'
import type { EditorChromeVisualTab } from '@/components/workspace/editor-tabs/utils/editor-tab-types'

describe('editorTabDropIndex', () => {
  it('inserts before the first tab midpoint', () => {
    expect(editorTabDropIndex(tabBounds(), 25, 'tab-b')).toBe(0)
  })

  it('inserts between non-dragged tab midpoints', () => {
    expect(editorTabDropIndex(tabBounds(), 175, 'tab-b')).toBe(1)
  })

  it('inserts at the end after the last midpoint', () => {
    expect(editorTabDropIndex(tabBounds(), 280, 'tab-a')).toBe(2)
  })

  it('ignores the dragged tab when calculating the target index', () => {
    expect(editorTabDropIndex(tabBounds(), 125, 'tab-b')).toBe(1)
  })

  it('returns zero when the dragged tab is the only target', () => {
    expect(
      editorTabDropIndex([{ id: 'tab-a', left: 0, path: 'src/a.ts', right: 100 }], 75, 'tab-a'),
    ).toBe(0)
  })
})

describe('editorTabDragReducer', () => {
  it('starts a drag with the source tab as the initial target', () => {
    expect(
      editorTabDragReducer(null, {
        paneId: 'pane-a',
        path: 'src/b.ts',
        sourceIndex: 1,
        tabId: 'tab-b',
        type: 'start',
      }),
    ).toEqual({
      detached: false,
      detachProgress: 0,
      offsetX: 0,
      paneId: 'pane-a',
      path: 'src/b.ts',
      sourceIndex: 1,
      tabId: 'tab-b',
      targetIndex: 1,
    })
  })

  it('updates the drag target index and clears the drag', () => {
    const dragging = {
      detached: false,
      detachProgress: 0,
      offsetX: 0,
      paneId: 'pane-a',
      path: 'src/b.ts',
      sourceIndex: 1,
      tabId: 'tab-b',
      targetIndex: 1,
    }

    expect(editorTabDragReducer(dragging, { targetIndex: 0, type: 'target' })).toEqual({
      detached: false,
      detachProgress: 0,
      offsetX: 0,
      paneId: 'pane-a',
      path: 'src/b.ts',
      sourceIndex: 1,
      tabId: 'tab-b',
      targetIndex: 0,
    })
    expect(editorTabDragReducer(dragging, { type: 'clear' })).toBeNull()
  })

  it('tracks attached pointer movement without detaching', () => {
    const dragging = {
      detached: false,
      detachProgress: 0,
      offsetX: 0,
      paneId: 'pane-a',
      path: 'src/b.ts',
      sourceIndex: 1,
      tabId: 'tab-b',
      targetIndex: 1,
    }

    expect(
      editorTabDragReducer(dragging, {
        detached: false,
        detachProgress: 0.5,
        offsetX: 28,
        targetIndex: 0,
        type: 'move',
      }),
    ).toEqual({
      detached: false,
      detachProgress: 0.5,
      offsetX: 28,
      paneId: 'pane-a',
      path: 'src/b.ts',
      sourceIndex: 1,
      tabId: 'tab-b',
      targetIndex: 0,
    })
  })
})

describe('editorTabDetachState', () => {
  it('uses Chromium-derived mouse and touch detach thresholds', () => {
    expect(
      editorTabDetachState({
        currentY: EDITOR_TAB_MOUSE_DETACH_THRESHOLD_PX - 1,
        pointerType: 'mouse',
        startY: 0,
        wasDetached: false,
      }).detached,
    ).toBe(false)
    expect(
      editorTabDetachState({
        currentY: EDITOR_TAB_MOUSE_DETACH_THRESHOLD_PX,
        pointerType: 'mouse',
        startY: 0,
        wasDetached: false,
      }).detached,
    ).toBe(true)
    expect(
      editorTabDetachState({
        currentY: EDITOR_TAB_TOUCH_DETACH_THRESHOLD_PX - 1,
        pointerType: 'touch',
        startY: 0,
        wasDetached: false,
      }).detached,
    ).toBe(false)
  })

  it('uses hysteresis before reattaching a detached tab', () => {
    expect(
      editorTabDetachState({
        currentY: EDITOR_TAB_MOUSE_DETACH_THRESHOLD_PX - EDITOR_TAB_DETACH_HYSTERESIS_PX,
        pointerType: 'mouse',
        startY: 0,
        wasDetached: true,
      }).detached,
    ).toBe(true)
    expect(
      editorTabDetachState({
        currentY: EDITOR_TAB_MOUSE_DETACH_THRESHOLD_PX - EDITOR_TAB_DETACH_HYSTERESIS_PX - 1,
        pointerType: 'mouse',
        startY: 0,
        wasDetached: true,
      }).detached,
    ).toBe(false)
  })

  it('reports normalized detach progress', () => {
    expect(
      editorTabDetachState({
        currentY: EDITOR_TAB_MOUSE_DETACH_THRESHOLD_PX / 2,
        pointerType: 'mouse',
        startY: 0,
        wasDetached: false,
      }).progress,
    ).toBe(0.5)
  })
})

describe('hasEditorTabDragPayload', () => {
  it('detects editor tab drags from the MIME type before drop data is readable', () => {
    expect(hasEditorTabDragPayload(dataTransferWithTypes([EDITOR_TAB_DRAG_MIME]))).toBe(true)
  })

  it('ignores non-editor drags', () => {
    expect(hasEditorTabDragPayload(dataTransferWithTypes(['text/plain']))).toBe(false)
  })
})

function dataTransferWithTypes(types: string[]): DataTransfer {
  return { types } as unknown as DataTransfer
}

describe('editorTabInsertionEdge', () => {
  it('marks the tab before the drop target', () => {
    const tabs = pathOnlyTabs()

    expect(
      editorTabInsertionEdge(tabs, tabs[0]!, {
        detached: false,
        detachProgress: 0,
        offsetX: 0,
        paneId: 'pane-a',
        path: 'src/b.ts',
        sourceIndex: 1,
        tabId: 'tab-b',
        targetIndex: 0,
      }),
    ).toBe('before')
  })

  it('marks the last tab when dropping after all targets', () => {
    const tabs = pathOnlyTabs()

    expect(
      editorTabInsertionEdge(tabs, tabs[2]!, {
        detached: false,
        detachProgress: 0,
        offsetX: 0,
        paneId: 'pane-a',
        path: 'src/b.ts',
        sourceIndex: 1,
        tabId: 'tab-b',
        targetIndex: 2,
      }),
    ).toBe('after')
  })

  it("does not mark the dragged tab's current slot", () => {
    const tabs = pathOnlyTabs()

    expect(
      editorTabInsertionEdge(tabs, tabs[2]!, {
        detached: false,
        detachProgress: 0,
        offsetX: 0,
        paneId: 'pane-a',
        path: 'src/b.ts',
        sourceIndex: 1,
        tabId: 'tab-b',
        targetIndex: 1,
      }),
    ).toBeNull()
  })
})

describe('chromeVisualTabsReducer', () => {
  it('keeps existing tabs present and opens newly added tabs', () => {
    const initialTabs = chromeTabs(['src/a.ts', 'src/b.ts'])
    const nextTabs = chromeTabs(['src/a.ts', 'src/c.ts'])
    const state = chromeVisualTabsState(initialTabs)

    const next = chromeVisualTabsReducer(state, {
      areTabsEqual: sameChromeTab,
      tabs: nextTabs,
      type: 'sync-tabs',
    })

    expect(next.sourceTabs).toBe(nextTabs)
    expect(next.visualTabs.map((visualTab) => visualTab.phase)).toEqual([
      'present',
      'closing',
      'opening',
    ])
    expect(next.visualTabs.map((visualTab) => visualTab.tab.path)).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
    ])
  })

  it('finishes opening tabs on the matching animation frame', () => {
    const state = chromeVisualTabsState(chromeTabs(['src/a.ts']))
    const synced = chromeVisualTabsReducer(state, {
      areTabsEqual: sameChromeTab,
      tabs: chromeTabs(['src/a.ts', 'src/b.ts']),
      type: 'sync-tabs',
    })

    const next = chromeVisualTabsReducer(synced, {
      openingKey: 'src/b.ts',
      type: 'finish-opening',
    })

    expect(next.visualTabs.map((visualTab) => visualTab.phase)).toEqual(['present', 'present'])
  })

  it('keeps missing tabs closing before delayed removal', () => {
    const initialTabs = chromeTabs(['src/a.ts', 'src/b.ts', 'src/c.ts'])
    const state = chromeVisualTabsState(initialTabs)
    const nextTabs = chromeTabs(['src/a.ts', 'src/c.ts'])

    const next = chromeVisualTabsReducer(state, {
      areTabsEqual: sameChromeTab,
      tabs: nextTabs,
      type: 'sync-tabs',
    })

    expect(next.visualTabs.map((visualTab) => visualTab.phase)).toEqual([
      'present',
      'closing',
      'present',
    ])
    expect(next.visualTabs.map((visualTab) => visualTab.tab.path)).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
    ])
  })

  it('removes closing tabs on the matching hold timeout', () => {
    const initialTabs = chromeTabs(['src/a.ts', 'src/b.ts', 'src/c.ts'])
    const state = chromeVisualTabsState(initialTabs)
    const synced = chromeVisualTabsReducer(state, {
      areTabsEqual: sameChromeTab,
      tabs: chromeTabs(['src/a.ts', 'src/c.ts']),
      type: 'sync-tabs',
    })

    const next = chromeVisualTabsReducer(synced, {
      closingKey: 'src/b.ts',
      type: 'remove-closing',
    })

    expect(next.visualTabs.map((visualTab) => visualTab.phase)).toEqual(['present', 'present'])
    expect(next.visualTabs.map((visualTab) => visualTab.tab.path)).toEqual(['src/a.ts', 'src/c.ts'])
  })

  it('keeps repeated closes in closing phase during the same hold window', () => {
    const initialTabs = chromeTabs(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'])
    const state = chromeVisualTabsState(initialTabs)
    const firstClose = chromeVisualTabsReducer(state, {
      areTabsEqual: sameChromeTab,
      tabs: chromeTabs(['src/a.ts', 'src/c.ts', 'src/d.ts']),
      type: 'sync-tabs',
    })

    const secondClose = chromeVisualTabsReducer(firstClose, {
      areTabsEqual: sameChromeTab,
      tabs: chromeTabs(['src/a.ts', 'src/d.ts']),
      type: 'sync-tabs',
    })

    expect(secondClose.visualTabs.map((visualTab) => visualTab.phase)).toEqual([
      'present',
      'closing',
      'closing',
      'present',
    ])
    expect(secondClose.visualTabs.map((visualTab) => visualTab.tab.path)).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
      'src/d.ts',
    ])
  })

  it('reuses semantically equal tab models', () => {
    const initialTabs = chromeTabs(['src/a.ts'])
    const state = chromeVisualTabsState(initialTabs)
    const nextTabs = chromeTabs(['src/a.ts'])

    const visualTabs = syncChromeVisualTabs(state.visualTabs, nextTabs, sameChromeTab)

    expect(visualTabs[0]?.tab).toBe(initialTabs[0])
  })

  it('ignores semantically equal source arrays', () => {
    const initialTabs = chromeTabs(['src/a.ts'])
    const state = chromeVisualTabsState(initialTabs)

    const next = chromeVisualTabsReducer(state, {
      areTabsEqual: sameChromeTab,
      tabs: chromeTabs(['src/a.ts']),
      type: 'sync-tabs',
    })

    expect(next).toBe(state)
  })

  it('restores closing tabs from a primed pane cache after a remount', () => {
    const cacheKey = 'chrome-visual-tabs-remount-test'
    const initialTabs = chromeTabs(['src/a.ts', 'src/b.ts', 'src/c.ts'])
    const state = chromeVisualTabsState(initialTabs)

    primeChromeVisualTabsCache(cacheKey, initialTabs, state.visualTabs)
    const remounted = chromeVisualTabsInitialState(
      chromeTabs(['src/a.ts', 'src/c.ts']),
      cacheKey,
      sameChromeTab,
    )

    expect(remounted.visualTabs.map((visualTab) => visualTab.phase)).toEqual([
      'present',
      'closing',
      'present',
    ])
    expect(remounted.visualTabs.map((visualTab) => visualTab.tab.path)).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
    ])
  })
})

describe('editorTabCloseTargetIds', () => {
  it('targets the clicked tab for close', () => {
    expect(editorTabCloseTargetIds(editorTabs(), 'tab-b', 'close')).toEqual(['tab-b'])
  })

  it('targets every tab except the clicked tab for close others', () => {
    expect(editorTabCloseTargetIds(editorTabs(), 'tab-b', 'closeOthers')).toEqual([
      'tab-a',
      'tab-c',
      'tab-d',
    ])
  })

  it('targets tabs to the right of the clicked tab', () => {
    expect(editorTabCloseTargetIds(editorTabs(), 'tab-b', 'closeToRight')).toEqual([
      'tab-c',
      'tab-d',
    ])
  })

  it('targets only clean tabs for close saved', () => {
    expect(editorTabCloseTargetIds(editorTabs(), 'tab-b', 'closeSaved')).toEqual(['tab-a', 'tab-c'])
  })

  it('targets every tab for close all', () => {
    expect(editorTabCloseTargetIds(editorTabs(), 'tab-b', 'closeAll')).toEqual([
      'tab-a',
      'tab-b',
      'tab-c',
      'tab-d',
    ])
  })

  it('returns no targets when the tab is missing', () => {
    expect(editorTabCloseTargetIds(editorTabs(), 'missing-tab', 'closeAll')).toEqual([])
  })
})

describe('chromeTabCloseTargetAfterClosingTab', () => {
  it('returns the first non-closing tab after the clicked closing tab', () => {
    expect(
      chromeTabCloseTargetAfterClosingTab(
        chromeVisualTabs(['present', 'closing', 'present'], ['tab-a', 'tab-b', 'tab-c']),
        'tab-b',
      ),
    ).toBe('tab-c')
  })

  it('skips tabs already closing during a close burst', () => {
    expect(
      chromeTabCloseTargetAfterClosingTab(
        chromeVisualTabs(
          ['present', 'closing', 'closing', 'present'],
          ['tab-a', 'tab-b', 'tab-c', 'tab-d'],
        ),
        'tab-b',
      ),
    ).toBe('tab-d')
  })

  it('returns null when no following tab can be closed', () => {
    expect(
      chromeTabCloseTargetAfterClosingTab(
        chromeVisualTabs(['present', 'closing'], ['tab-a', 'tab-b']),
        'tab-b',
      ),
    ).toBeNull()
  })
})

describe('chromeTabCloseBurstTargetId', () => {
  it('returns only the survivor after the rightmost closing tab', () => {
    expect(
      chromeTabCloseBurstTargetId(
        chromeVisualTabs(
          ['present', 'closing', 'closing', 'present', 'present'],
          ['tab-a', 'tab-b', 'tab-c', 'tab-d', 'tab-e'],
        ),
      ),
    ).toBe('tab-d')
  })

  it('returns null when no closing tab has a survivor after it', () => {
    expect(
      chromeTabCloseBurstTargetId(chromeVisualTabs(['present', 'closing'], ['tab-a', 'tab-b'])),
    ).toBeNull()
  })
})

describe('chromeTabStyle', () => {
  it('collapses closing tabs without transitioning their hit box', () => {
    const closingTab = chromeVisualTabs(['closing'], ['tab-a'])[0]!
    const style = chromeTabStyle(closingTab, 0, 18, 64, 0)

    expect(style.transition).toBe('none')
    expect(style.flex).toBe('0 0 18px')
    expect(style.width).toBe(18)
  })
})

describe('chrome close layout snapshots', () => {
  it('holds survivor widths from the pre-close layout', () => {
    const visualTabs = chromeVisualTabs(
      ['present', 'present', 'present'],
      ['tab-a', 'tab-b', 'tab-c'],
    )
    const snapshot = chromeTabCloseLayoutSnapshot(visualTabs, chromeLayout([96, 96, 96], 12))
    const closingTabs = chromeVisualTabs(
      ['present', 'closing', 'present'],
      ['tab-a', 'tab-b', 'tab-c'],
    )

    expect(hasClosingChromeTabs(closingTabs)).toBe(true)
    expect(chromeTabCloseLayoutWidth(snapshot, closingTabs[2]!, 140)).toBe(96)
  })

  it('falls back to the live layout for tabs opened during close mode', () => {
    const visualTabs = chromeVisualTabs(['present'], ['tab-a'])
    const snapshot = chromeTabCloseLayoutSnapshot(visualTabs, chromeLayout([100], 0))
    const openingTab = chromeVisualTabs(['opening'], ['tab-b'])[0]!

    expect(chromeTabCloseLayoutWidth(snapshot, openingTab, 80)).toBe(80)
  })

  it('shrinks the virtual available width by closing tab contribution', () => {
    const visualTabs = chromeVisualTabs(
      ['present', 'present', 'present'],
      ['tab-a', 'tab-b', 'tab-c'],
    )
    const snapshot = chromeTabCloseLayoutSnapshot(visualTabs, chromeLayout([96, 96, 96], 12))
    const closingTabs = chromeVisualTabs(
      ['present', 'closing', 'present'],
      ['tab-a', 'tab-b', 'tab-c'],
    )

    expect(chromeTabCloseModeAvailableWidth(snapshot, closingTabs, 300)).toBe(216)
  })

  it('preserves currently held widths when refreshing a close burst snapshot', () => {
    const visualTabs = chromeVisualTabs(
      ['present', 'present', 'present'],
      ['tab-a', 'tab-b', 'tab-c'],
    )
    const snapshot = chromeTabCloseLayoutSnapshot(visualTabs, chromeLayout([96, 96, 96], 12))
    const closingTabs = chromeVisualTabs(
      ['present', 'closing', 'present'],
      ['tab-a', 'tab-b', 'tab-c'],
    )
    const nextSnapshot = chromeTabCloseLayoutSnapshot(
      closingTabs,
      chromeLayout([120, 120, 120], 12),
      snapshot,
    )

    expect(chromeTabCloseLayoutWidth(nextSnapshot, closingTabs[0]!, 120)).toBe(96)
    expect(chromeTabCloseLayoutWidth(nextSnapshot, closingTabs[1]!, 120)).toBe(12)
    expect(chromeTabCloseLayoutWidth(nextSnapshot, closingTabs[2]!, 120)).toBe(96)
  })

  it('reserves active width for an inactive tab promoted by closing the selected tab', () => {
    const visualTabs = chromeVisualTabs(['present', 'present'], ['tab-a', 'tab-b']).map(
      (visualTab, index) => ({
        ...visualTab,
        tab: { ...visualTab.tab, active: index === 0 },
      }),
    )
    const snapshot = chromeTabCloseLayoutSnapshot(
      visualTabs,
      chromeLayout([108, 64], 18),
      null,
      promotedChromeTabIdAfterClose(visualTabs, 'tab-a'),
    )

    expect(chromeTabCloseLayoutWidth(snapshot, visualTabs[1]!, 64)).toBe(108)
  })

  it('adds the active close slot when a standard inactive tab is promoted', () => {
    const visualTabs = chromeVisualTabs(['present', 'present'], ['tab-a', 'tab-b']).map(
      (visualTab, index) => ({
        ...visualTab,
        tab: { ...visualTab.tab, active: index === 0 },
      }),
    )
    const snapshot = chromeTabCloseLayoutSnapshot(
      visualTabs,
      chromeLayout([252, 224], 0),
      null,
      promotedChromeTabIdAfterClose(visualTabs, 'tab-a'),
    )

    expect(chromeTabCloseLayoutWidth(snapshot, visualTabs[1]!, 224)).toBe(252)
  })

  it('reuses the calculated close layout snapshot from a pane cache', () => {
    const cacheKey = 'chrome-close-layout-remount-test'
    const visualTabs = chromeVisualTabs(['present'], ['tab-a'])
    const snapshot = chromeTabCloseLayoutSnapshot(visualTabs, chromeLayout([96], 0))

    cacheChromeTabCloseLayoutSnapshot(cacheKey, snapshot)

    expect(
      chromeTabCloseLayoutWidth(cachedChromeTabCloseLayoutSnapshot(cacheKey), visualTabs[0]!, 140),
    ).toBe(96)
  })
})

function tabBounds(): readonly EditorTabDropTargetBounds[] {
  return [
    { id: 'tab-a', left: 0, path: 'src/a.ts', right: 100 },
    { id: 'tab-b', left: 100, path: 'src/b.ts', right: 200 },
    { id: 'tab-c', left: 200, path: 'src/c.ts', right: 300 },
  ]
}

function pathOnlyTabs() {
  return [
    { id: 'tab-a', path: 'src/a.ts' },
    { id: 'tab-b', path: 'src/b.ts' },
    { id: 'tab-c', path: 'src/c.ts' },
  ]
}

function editorTabs() {
  return [
    { dirty: false, id: 'tab-a', path: 'src/a.ts' },
    { dirty: true, id: 'tab-b', path: 'src/b.ts' },
    { dirty: false, id: 'tab-c', path: 'src/c.ts' },
    { dirty: true, id: 'tab-d', path: 'src/d.ts' },
  ]
}

function chromeTabs(paths: readonly string[]) {
  return paths.map((path) => ({ path }))
}

function chromeVisualTabs(
  phases: readonly ('closing' | 'opening' | 'present')[],
  ids: string[],
): EditorChromeVisualTab[] {
  return phases.map((phase, index) => ({
    phase,
    tab: {
      active: false,
      copyPath: ids[index] ?? '',
      copyRelativePath: ids[index] ?? '',
      diffStatus: null,
      diffSuffix: '',
      icon: { name: 'file', src: '' },
      id: ids[index] ?? '',
      name: ids[index] ?? '',
      path: ids[index] ?? '',
      title: ids[index] ?? '',
    },
  }))
}

function chromeLayout(widths: readonly number[], overlap: number) {
  return {
    overlap,
    tabs: widths.map((width, index) => ({
      index,
      width,
      x: index * width,
    })),
    trackWidth: widths.reduce((total, width) => total + width, 0),
  }
}

function chromeVisualTabsState(
  tabs: ReturnType<typeof chromeTabs>,
): ChromeVisualTabsState<{ path: string }> {
  return {
    sourceTabs: tabs,
    visualTabs: tabs.map((tab) => ({ phase: 'present', tab })),
  }
}

function sameChromeTab(left: { path: string }, right: { path: string }) {
  return left.path === right.path
}
