import { actionItem, commandItem, section } from '@/features/menus/utils/model'
import { resolveMenu, type MenuResolveContext } from '@/features/menus/utils/resolve'
import type { PlatformCommandId, PlatformKeyBinding } from '@/keymap/types'
import { expect, test } from '../../../../../test/fixtures'

test('fills label and shortcut for a command item from the registry', () => {
  const [group] = resolveMenu([section('save', [commandItem('workspace.saveFile')])], context())
  const [item] = group.items

  expect(item.kind).toBe('run')
  expect(item).toMatchObject({ key: 'workspace.saveFile', label: 'Save' })
  expect(item.kind === 'run' && item.trailing).toContain('S')
})

test('an explicit label overrides the registry title', () => {
  const menu = [section('close', [commandItem('workspace.closeCurrentTab', { label: 'Close' })])]
  const [group] = resolveMenu(menu, context())

  expect(group.items[0]).toMatchObject({ label: 'Close' })
})

test('dispatching a command item routes through the registry dispatch', () => {
  const dispatched: PlatformCommandId[] = []
  const menu = [section('save', [commandItem('workspace.saveFile')])]
  const [group] = resolveMenu(menu, context({ dispatch: (id) => dispatched.push(id) }))

  const item = group.items[0]
  if (item.kind !== 'run') throw new Error('expected a run item')
  item.run()

  expect(dispatched).toEqual(['workspace.saveFile'])
})

test('a command the registry reports unavailable resolves disabled', () => {
  const menu = [section('save', [commandItem('workspace.saveFile')])]
  const [group] = resolveMenu(menu, context({ hasWorkspace: false }))

  expect(group.items[0]).toMatchObject({ disabled: true })
})

test('an unavailable item is disabled and states why in the trailing slot', () => {
  const menu = [
    section('split', [
      actionItem({ id: 'splitRight', label: 'Split Right', run: noop, unavailable: 'soon' }),
    ]),
  ]
  const [group] = resolveMenu(menu, context())

  expect(group.items[0]).toMatchObject({ disabled: true, label: 'Split Right', trailing: 'soon' })
})

test('drops sections that filter down to nothing so no separator is left behind', () => {
  const menu = [
    section('open', [actionItem({ id: 'open', label: 'Open', run: noop })]),
    section('git', [false, null]),
    section('copy', [actionItem({ id: 'copy', label: 'Copy Path', run: noop })]),
  ]

  expect(resolveMenu(menu, context()).map((group) => group.id)).toEqual(['open', 'copy'])
})

test('resolves submenu sections recursively', () => {
  const menu = [
    section('root', [
      {
        id: 'more',
        kind: 'submenu' as const,
        label: 'More',
        sections: [section('inner', [commandItem('workspace.saveFile')]), section('empty', [null])],
      },
    ]),
  ]
  const item = resolveMenu(menu, context())[0].items[0]

  if (item.kind !== 'submenu') throw new Error('expected a submenu item')
  expect(item.sections.map((group) => group.id)).toEqual(['inner'])
  expect(item.sections[0].items[0]).toMatchObject({ label: 'Save' })
})

function noop() {}

function context(
  overrides: {
    readonly dispatch?: (command: PlatformCommandId) => void
    readonly hasWorkspace?: boolean
  } = {},
): MenuResolveContext {
  return {
    bindings: [binding('Mod+S', 'workspace.saveFile')],
    disabled: {
      activeFilePath: '/repo/file.ts',
      hasWorkspace: overrides.hasWorkspace ?? true,
    },
    dispatch: overrides.dispatch ?? noop,
  }
}

function binding(hotkey: 'Mod+S' | 'Mod+W', command: PlatformCommandId): PlatformKeyBinding {
  return { command, hotkey, keys: hotkey, source: 'default' }
}
