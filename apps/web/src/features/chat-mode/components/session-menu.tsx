import type { ReactElement } from 'react'

import { useSessionMenu } from '@/features/chat-mode/hooks/use-session-menu'
import type { SessionRailItem } from '@/features/chat-mode/utils/session-rail-model'
import { MenuSurface } from '@/features/menus/components/surface'

export function SessionMenu({
  session,
  trigger,
}: {
  readonly session: SessionRailItem
  readonly trigger: ReactElement
}) {
  const menu = useSessionMenu(session)

  return <MenuSurface className='w-56' menu={menu} surface='chat.session' trigger={trigger} />
}
