import { afterEach, vi } from 'vitest'

import type {
  RequestCloseTab,
  UnsavedDialogTarget,
} from '@/features/editor/hooks/use-dirty-tab-close'
import { compareSavedDocumentId } from '@/features/editor/utils/compare-saved-document'
import { activeEditorTabForWorkbenchPanels } from '@/features/workbench/utils/panels'
import type { FocusArea, FocusTargetId, FocusTargetRegistration } from '@/lib/focus/state/service'
import { FocusService } from '@/lib/focus/state/service'
import { createTestCommandRuntime } from '../../../test/factories/command-runtime'
import { expect, test } from '../../../test/fixtures'
import { createTestQueryClient } from '../../../test/render'

const registrations: FocusTargetRegistration[] = []
const focusServices: FocusService[] = []

afterEach(() => {
  for (const registration of registrations.splice(0)) registration.unregister()
  for (const service of focusServices.splice(0)) {
    document.removeEventListener('focusin', service.handleFocusIn, true)
  }
  document.body.replaceChildren()
})

test('workspace editor focus acknowledges the active new-side diff target', async () => {
  const focus = trackedFocusService()
  const path = '/repo/src/changed.ts'
  const layout = document.createElement('div')
  layout.dataset.workbench = ''
  document.body.append(layout)
  const oldPane = registerDiffTarget(focus, layout, path, 'old')
  const newPane = registerDiffTarget(focus, layout, path, 'new')
  const commandRuntime = createTestCommandRuntime({
    focus,
    options: { rootPath: '/repo' },
    queryClient: createTestQueryClient(),
  })
  commandRuntime.runtime.editor.openFileSurface(compareSavedDocumentId(path))

  const ticket = commandRuntime.bus.dispatch('workspace.focusEditor', {
    source: { caller: 'command-dispatch-test', kind: 'programmatic' },
  })

  expect(ticket.claimed).toBe(true)
  await expect(ticket.completion).resolves.toEqual({ status: 'handled' })
  expect(document.activeElement).toBe(newPane)
  expect(document.activeElement).not.toBe(oldPane)
})

test('editor dispatch resolves the active tab only in the snapshot layout', async () => {
  const focus = trackedFocusService()
  const workbench = layoutElement('workbench')
  const chat = layoutElement('chat')
  const workbenchDispatch = vi.fn(() => true)
  const chatDispatch = vi.fn(() => true)
  registerEditorTarget(focus, workbench, 'document', 'tab-1', workbenchDispatch)
  registerEditorTarget(focus, chat, 'document', 'tab-1', chatDispatch)
  const commandRuntime = createTestCommandRuntime({
    focus,
    options: {
      snapshot: {
        activeFilePath: '/repo/src/active.ts',
        activeTabId: 'tab-1',
        uiMode: 'workbench',
      },
    },
    queryClient: createTestQueryClient(),
  })

  const ticket = commandRuntime.bus.dispatch('editor.selectAll', invocation())

  expect(ticket.claimed).toBe(true)
  await expect(ticket.completion).resolves.toEqual({ status: 'handled' })
  expect(workbenchDispatch).toHaveBeenCalledWith('selectAll', { event: undefined })
  expect(chatDispatch).not.toHaveBeenCalled()
})

test('test settings runtime reveals chat editor and accepts its nested JSON editor', async () => {
  const focus = trackedFocusService()
  const commandRuntime = createTestCommandRuntime({
    focus,
    options: { rootPath: '/repo' },
    queryClient: createTestQueryClient(),
  })
  commandRuntime.runtime.workspace.getState().setUiMode('chat')

  const ticket = commandRuntime.runtime.shell.showSettings()
  const state = commandRuntime.runtime.workspace.getState()
  const activeTab = activeEditorTabForWorkbenchPanels(state.workbenchPanels)

  expect(state.chatModePanels).toMatchObject({ activeToolTab: 'editor', toolPaneOpen: true })
  expect(activeTab).toBeDefined()
  const settingsTab = activeTab!

  const chat = layoutElement('chat')
  const editor = registerEditorTarget(focus, chat, 'settings', settingsTab.id)

  await expect(ticket.completion).resolves.toMatchObject({
    status: 'acknowledged',
    targetId: { kind: 'editor', surface: 'settings', tabId: settingsTab.id },
  })
  expect(document.activeElement).toBe(editor)
})

test('a same-path stale diff cannot acknowledge a newly opened compare tab', async () => {
  const focus = trackedFocusService()
  const path = '/repo/src/changed.ts'
  const layout = document.createElement('div')
  layout.dataset.workbench = ''
  document.body.append(layout)
  const stalePane = registerDiffTarget(focus, layout, path, 'new', 'stale-tab')
  const commandRuntime = createTestCommandRuntime({
    focus,
    options: { rootPath: '/repo' },
    queryClient: createTestQueryClient(),
  })
  commandRuntime.runtime.editor.openFileSurface(path)

  const ticket = commandRuntime.bus.dispatch('workspace.compareWithSaved', {
    source: { caller: 'command-dispatch-test', kind: 'programmatic' },
  })
  let settled = false
  void ticket.completion.then(() => {
    settled = true
  })
  await Promise.resolve()

  expect(ticket.claimed).toBe(true)
  expect(settled).toBe(false)
  expect(document.activeElement).not.toBe(stalePane)

  const activeTab = activeEditorTabForWorkbenchPanels(
    commandRuntime.runtime.workspace.getState().workbenchPanels,
  )
  expect(activeTab?.path).toBe(compareSavedDocumentId(path))
  expect(activeTab).not.toBeNull()
  if (!activeTab) return

  const activePane = registerDiffTarget(focus, layout, path, 'new', activeTab.id)

  await expect(ticket.completion).resolves.toEqual({ status: 'handled' })
  expect(document.activeElement).toBe(activePane)
})

test('an editor open that produces no active tab settles unavailable', async () => {
  const focus = trackedFocusService()
  const commandRuntime = createTestCommandRuntime({
    focus,
    options: {
      rootPath: '/repo',
      runtime: { editor: { openSearchEditor: () => {} } },
    },
    queryClient: createTestQueryClient(),
  })

  const ticket = commandRuntime.bus.dispatch('workspace.openSearchEditor', {
    source: { caller: 'command-dispatch-test', kind: 'programmatic' },
  })

  expect(ticket.claimed).toBe(true)
  await expect(ticket.completion).resolves.toEqual({
    reason: 'handler-declined',
    status: 'unhandled',
  })
  expect(focus.getSnapshot().requested).toBeNull()
})

test.each(['busy', 'not-found'] as const)(
  'close current tab leaves a %s rejection unclaimed',
  async (reason) => {
    const focus = trackedFocusService()
    const requestCloseTab = vi.fn(() => ({ reason, status: 'rejected' }) as const)
    const commandRuntime = closeCommandRuntime(focus, requestCloseTab)

    const ticket = commandRuntime.bus.dispatch('workspace.closeCurrentTab', invocation())

    expect(ticket.claimed).toBe(false)
    await expect(ticket.completion).resolves.toEqual({
      reason: 'handler-declined',
      status: 'unhandled',
    })
    expect(requestCloseTab).toHaveBeenCalledWith('tab-1')
  },
)

test('close current tab waits for the exact dirty-dialog focus acknowledgement', async () => {
  const focus = trackedFocusService()
  const dialogTarget = Object.freeze({}) as UnsavedDialogTarget
  const wrongTarget = Object.freeze({}) as UnsavedDialogTarget
  const wrongDialog = registerPassiveTarget(
    focus,
    'dialog',
    { dialogTarget: wrongTarget, kind: 'unsaved-dialog' },
    'Wrong dialog',
  )
  const dialog = registerPassiveTarget(
    focus,
    'dialog',
    { dialogTarget, kind: 'unsaved-dialog' },
    'Dirty dialog',
  )
  const requestCloseTab = vi.fn(
    () => ({ dialogTarget, status: 'deferred', tabIds: ['tab-1'] }) as const,
  )
  const commandRuntime = closeCommandRuntime(focus, requestCloseTab)

  const ticket = commandRuntime.bus.dispatch('workspace.closeCurrentTab', invocation())
  let settled = false
  void ticket.completion.then(() => {
    settled = true
  })
  await Promise.resolve()

  expect(ticket.claimed).toBe(true)
  expect(settled).toBe(false)

  wrongDialog.focus()
  await Promise.resolve()
  expect(settled).toBe(false)

  dialog.focus()
  await expect(ticket.completion).resolves.toEqual({
    reason: 'dirty-close',
    status: 'deferred',
  })
})

test('a clean close settles only after app-shell focus acknowledgement', async () => {
  const focus = trackedFocusService()
  const shell = registerPassiveTarget(focus, 'global', { kind: 'app-shell' }, 'App shell')
  const requestCloseTab = vi.fn(() => ({ status: 'closed', tabIds: ['tab-1'] }) as const)
  const commandRuntime = closeCommandRuntime(focus, requestCloseTab)

  const ticket = commandRuntime.bus.dispatch('workspace.closeCurrentTab', invocation())
  let settled = false
  void ticket.completion.then(() => {
    settled = true
  })
  await Promise.resolve()

  expect(ticket.claimed).toBe(true)
  expect(settled).toBe(false)

  shell.focus()
  await expect(ticket.completion).resolves.toEqual({ status: 'handled' })
})

function trackedFocusService() {
  const service = new FocusService()
  focusServices.push(service)
  document.addEventListener('focusin', service.handleFocusIn, true)
  return service
}

function closeCommandRuntime(focus: FocusService, requestCloseTab: RequestCloseTab) {
  return createTestCommandRuntime({
    focus,
    options: {
      rootPath: '/repo',
      runtime: { tabs: { requestCloseTab } },
      snapshot: { activeFilePath: '/repo/src/active.ts', activeTabId: 'tab-1' },
    },
    queryClient: createTestQueryClient(),
  })
}

function invocation() {
  return { source: { caller: 'command-dispatch-test', kind: 'programmatic' } } as const
}

function registerPassiveTarget(
  focus: FocusService,
  area: FocusArea,
  id: FocusTargetId,
  label: string,
) {
  const element = document.createElement('button')
  element.textContent = label
  document.body.append(element)
  registrations.push(
    focus.register({
      area,
      element,
      id,
      onIntent: () => true,
    }),
  )
  return element
}

function registerDiffTarget(
  focus: FocusService,
  layout: HTMLElement,
  key: string,
  side: 'new' | 'old',
  tabId?: string,
) {
  return registerEditorTarget(focus, layout, 'diff', tabId, () => false, key, side)
}

function registerEditorTarget(
  focus: FocusService,
  layout: HTMLElement,
  surface: Extract<FocusTargetId, { kind: 'editor' }>['surface'],
  tabId?: string,
  dispatch: () => boolean = () => false,
  key = '/repo/src/active.ts',
  side?: 'new' | 'old' | 'stacked',
) {
  const element = document.createElement('div')
  element.tabIndex = -1
  layout.append(element)
  registrations.push(
    focus.register({
      area: 'editor',
      capabilities: {
        editor: { dispatch, writable: false },
      },
      element,
      id: { key, kind: 'editor', side, surface, tabId },
      onIntent: (intent, target) => {
        if (intent !== 'focus') return false

        target.focus()
        return true
      },
    }),
  )
  return element
}

function layoutElement(layout: 'chat' | 'workbench') {
  const element = document.createElement('div')
  if (layout === 'chat') element.dataset.chatMode = ''
  if (layout === 'workbench') element.dataset.workbench = ''
  document.body.append(element)
  return element
}
