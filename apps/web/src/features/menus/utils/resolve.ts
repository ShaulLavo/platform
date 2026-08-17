import type { Icon } from '@phosphor-icons/react'

import { commandDisabledReason, type CommandDisabledContext } from '@/keymap/command-enablement'
import { platformCommandSpec } from '@/keymap/command-registry'
import type { PlatformCommandId, PlatformKeyBinding } from '@/keymap/types'

import type { Menu, MenuItem, MenuRadioItem, MenuSection } from './model'
import { menuItemKey } from './model'
import { commandShortcut } from './shortcut'

export type MenuResolveContext = {
  readonly bindings: readonly PlatformKeyBinding[]
  readonly disabled: CommandDisabledContext
  readonly dispatch: (command: PlatformCommandId) => void
}

/** Command and action items collapse to one shape — both just run something. */
export type ResolvedRunItem = {
  readonly kind: 'run'
  readonly key: string
  readonly label: string
  readonly icon?: Icon
  /** Shortcut glyphs, or the reason the item is unavailable. */
  readonly trailing: string | null
  readonly disabled: boolean
  readonly destructive: boolean
  readonly command: PlatformCommandId | null
  readonly run: () => void
}

export type ResolvedCheckboxItem = {
  readonly kind: 'checkbox'
  readonly key: string
  readonly label: string
  readonly icon?: Icon
  readonly checked: boolean
  readonly disabled: boolean
  readonly toggle: (checked: boolean) => void
}

export type ResolvedRadioGroupItem = {
  readonly kind: 'radio-group'
  readonly key: string
  readonly value: string
  readonly options: readonly MenuRadioItem[]
  readonly select: (value: string) => void
}

export type ResolvedSubmenuItem = {
  readonly kind: 'submenu'
  readonly key: string
  readonly label: string
  readonly icon?: Icon
  readonly disabled: boolean
  readonly sections: readonly ResolvedMenuSection[]
}

export type ResolvedMenuItem =
  | ResolvedCheckboxItem
  | ResolvedRadioGroupItem
  | ResolvedRunItem
  | ResolvedSubmenuItem

export type ResolvedMenuSection = {
  readonly id: string
  readonly label?: string
  readonly items: readonly ResolvedMenuItem[]
}

export type ResolvedMenu = readonly ResolvedMenuSection[]

/**
 * Fills labels, shortcuts, and availability from the command registry, then
 * drops sections that ended up empty so a filtered-out group cannot leave a
 * dangling separator behind.
 */
export function resolveMenu(menu: Menu, context: MenuResolveContext): ResolvedMenu {
  return menu.map((entry) => resolveSection(entry, context)).filter(sectionHasItems)
}

function resolveSection(entry: MenuSection, context: MenuResolveContext): ResolvedMenuSection {
  const items = entry.items
    .filter((item): item is MenuItem => Boolean(item))
    .map((item) => resolveItem(item, context))

  return { id: entry.id, items, label: entry.label }
}

function sectionHasItems(entry: ResolvedMenuSection) {
  return entry.items.length > 0
}

function resolveItem(item: MenuItem, context: MenuResolveContext): ResolvedMenuItem {
  if (item.kind === 'command') return resolveCommandItem(item, context)
  if (item.kind === 'submenu') {
    return {
      disabled: Boolean(item.unavailable),
      icon: item.icon,
      key: item.id,
      kind: 'submenu',
      label: item.label,
      sections: resolveMenu(item.sections, context),
    }
  }
  if (item.kind === 'checkbox') {
    return {
      checked: item.checked,
      disabled: Boolean(item.disabled) || Boolean(item.unavailable),
      icon: item.icon,
      key: item.id,
      kind: 'checkbox',
      label: item.label,
      toggle: item.toggle,
    }
  }
  if (item.kind === 'radio-group') {
    return {
      key: item.id,
      kind: 'radio-group',
      options: item.options,
      select: item.select,
      value: item.value,
    }
  }

  return {
    command: null,
    destructive: Boolean(item.destructive),
    disabled: Boolean(item.disabled) || Boolean(item.unavailable),
    icon: item.icon,
    key: item.id,
    kind: 'run',
    label: item.label,
    run: item.run,
    trailing: item.unavailable ?? item.shortcut ?? null,
  }
}

function resolveCommandItem(
  item: Extract<MenuItem, { kind: 'command' }>,
  context: MenuResolveContext,
): ResolvedRunItem {
  const spec = platformCommandSpec(item.command)
  const registryReason = commandDisabledReason(item.command, context.disabled)

  return {
    command: item.command,
    destructive: false,
    disabled: Boolean(item.unavailable) || registryReason !== null,
    icon: item.icon,
    key: menuItemKey(item),
    kind: 'run',
    label: item.label ?? spec?.title ?? item.command,
    run: () => context.dispatch(item.command),
    trailing: item.unavailable ?? commandShortcut(item.command, context.bindings),
  }
}
