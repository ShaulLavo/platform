import type { ReactElement } from 'react'

import { useResolvedMenu } from '@/features/menus/hooks/use-resolved-menu'
import type { Menu, MenuSurfaceId } from '@/features/menus/utils/model'
import type { ResolvedMenuItem } from '@/features/menus/utils/resolve'
import type { MenuAnchor } from '@/features/menus/utils/virtual-anchor'
import { log } from '@/lib/client-logging'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@workspace/ui/components/context-menu'

import { MenuSection } from './section'

/**
 * The only place app code touches Base UI's context menu parts. Two ways in:
 *
 * - pass `trigger` and Base UI wraps the element, tracks the cursor, and owns
 *   open state. Correct for anything that renders its own DOM node.
 * - pass `anchor` + `open` + `onOpenChange` and the menu opens at a virtual
 *   rect with no trigger at all. The path for surfaces with nothing to wrap:
 *   the terminal canvas, the shadow-DOM file tree, keyboard invocation.
 */
export function MenuSurface({
  anchor,
  className,
  menu,
  onOpenChange,
  open,
  popupProps,
  surface,
  trigger,
}: {
  readonly anchor?: MenuAnchor | null
  readonly className?: string
  readonly menu: Menu
  readonly onOpenChange?: (open: boolean) => void
  readonly open?: boolean
  /**
   * Data attributes for the portalled popup. Surfaces that run their own
   * outside-click detection need to recognise our menu as inside — the file
   * tree looks for `data-file-tree-context-menu-root`.
   */
  readonly popupProps?: Readonly<Record<`data-${string}`, string>>
  readonly surface: MenuSurfaceId
  readonly trigger?: ReactElement
}) {
  const sections = useResolvedMenu(menu)

  /**
   * Logging only — the row itself runs the item. Every kind reports, so a menu
   * whose only affordance is a radio group is not invisible in the logs.
   */
  function handleInvoke(item: ResolvedMenuItem, value?: string) {
    log.info({
      action: 'menu.invoke',
      area: 'command',
      command: item.kind === 'run' ? item.command : null,
      item: item.key,
      menu: surface,
      value,
    })
  }

  return (
    <ContextMenu onOpenChange={onOpenChange} open={open}>
      {trigger ? <ContextMenuTrigger render={trigger} /> : null}
      <ContextMenuContent
        anchor={anchor ?? undefined}
        className={className}
        data-menu-surface={surface}
        {...popupProps}
      >
        {sections.map((section, index) => (
          <MenuSection index={index} key={section.id} onInvoke={handleInvoke} section={section} />
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}
