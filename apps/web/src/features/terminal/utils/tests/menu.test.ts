import type { MenuActionItem } from '@/features/menus/utils/model'
import { terminalMenu, type TerminalMenuContext } from '@/features/terminal/utils/menu'
import { expect, test } from '../../../../../test/fixtures'

test('sections run clipboard, then screen, then scroll', () => {
  const ids = terminalMenu(menuContext({ hasScrollback: true })).map((entry) => entry.id)

  expect(ids).toEqual(['clipboard', 'screen', 'scroll'])
})

test('the clipboard section reads Copy, Paste, Select All', () => {
  expect(labels(menuContext(), 'clipboard')).toEqual(['Copy', 'Paste', 'Select All'])
})

test('Copy is disabled with nothing selected', () => {
  expect(item(menuContext({ hasSelection: false }), 'copy').disabled).toBe(true)
  expect(item(menuContext({ hasSelection: true }), 'copy').disabled).toBe(false)
})

test('Select All stays enabled with nothing selected', () => {
  expect(item(menuContext({ hasSelection: false }), 'selectAll').disabled).toBeFalsy()
})

test('Paste offers its shortcut when the clipboard can be read', () => {
  const paste = item(menuContext({ pasteBlocked: false }), 'paste')

  expect(paste.unavailable).toBeUndefined()
  expect(paste.shortcut).toBeTruthy()
})

test('a blocked Paste is unavailable, and says which key still works', () => {
  const paste = item(menuContext({ pasteBlocked: true }), 'paste')

  // `unavailable` is what disables the item and fills the trailing slot, so the
  // hint has to be the shortcut itself rather than a "soon" style excuse.
  expect(paste.unavailable).toBe(paste.shortcut)
  expect(paste.unavailable).toBeTruthy()
})

test('the screen section reads Clear, then Reset', () => {
  expect(labels(menuContext(), 'screen')).toEqual(['Clear', 'Reset'])
})

test('Reset is destructive and Clear is not', () => {
  expect(item(menuContext(), 'reset').destructive).toBe(true)
  expect(item(menuContext(), 'clear').destructive).toBeFalsy()
})

test('Clear advertises a shortcut because it sends a real key to the shell', () => {
  expect(item(menuContext(), 'clear').shortcut).toBeTruthy()
})

test('a terminal with no scrollback offers no scroll items', () => {
  // The section survives as an empty one; `resolveMenu` drops it before render,
  // which is what keeps a dangling separator off the bottom of the menu.
  expect(labels(menuContext({ hasScrollback: false }), 'scroll')).toEqual([])
})

test('scrollback adds Scroll to Top and Scroll to Bottom', () => {
  expect(labels(menuContext({ hasScrollback: true }), 'scroll')).toEqual([
    'Scroll to Top',
    'Scroll to Bottom',
  ])
})

test('every item runs the callback it was built from', () => {
  const ran: string[] = []
  const context = menuContext({ hasScrollback: true, hasSelection: true })
  const spied = Object.fromEntries(
    Object.entries(context).map(([key, value]) =>
      typeof value === 'function' ? [key, () => ran.push(key)] : [key, value],
    ),
  ) as TerminalMenuContext

  for (const entry of terminalMenu(spied)) {
    for (const candidate of entry.items) {
      if (!candidate) continue

      ;(candidate as MenuActionItem).run()
    }
  }

  expect(ran).toEqual([
    'copySelection',
    'paste',
    'selectAll',
    'clear',
    'reset',
    'scrollToTop',
    'scrollToBottom',
  ])
})

function actionItems(context: TerminalMenuContext, sectionId: string) {
  const entry = terminalMenu(context).find((candidate) => candidate.id === sectionId)

  return (entry?.items ?? []).filter(Boolean) as MenuActionItem[]
}

function labels(context: TerminalMenuContext, sectionId: string) {
  return actionItems(context, sectionId).map((entry) => entry.label)
}

function item(context: TerminalMenuContext, id: string) {
  const found = terminalMenu(context)
    .flatMap((entry) => entry.items)
    .filter(Boolean)
    .find((candidate) => (candidate as MenuActionItem).id === id)

  expect(found).toBeDefined()

  return found as MenuActionItem
}

function menuContext({
  hasScrollback = false,
  hasSelection = false,
  pasteBlocked = false,
}: {
  hasScrollback?: boolean
  hasSelection?: boolean
  pasteBlocked?: boolean
} = {}): TerminalMenuContext {
  return {
    clear: () => {},
    copySelection: () => {},
    hasScrollback,
    hasSelection,
    paste: () => {},
    pasteBlocked,
    reset: () => {},
    scrollToBottom: () => {},
    scrollToTop: () => {},
    selectAll: () => {},
  }
}
