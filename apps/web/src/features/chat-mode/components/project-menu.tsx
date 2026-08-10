import type { ReactElement } from 'react'

import { useProjectMenu } from '@/features/chat-mode/hooks/use-project-menu'
import type { SessionRailGroup } from '@/features/chat-mode/utils/session-rail-model'
import { MenuSurface } from '@/features/menus/components/surface'

export function ProjectMenu({
  group,
  trigger,
}: {
  readonly group: SessionRailGroup
  readonly trigger: ReactElement
}) {
  const menu = useProjectMenu(group)

  return <MenuSurface className='w-56' menu={menu} surface='chat.project' trigger={trigger} />
}
