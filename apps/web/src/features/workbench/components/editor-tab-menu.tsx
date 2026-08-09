import type { ReactElement } from 'react'

import type { EditorTabCloseTarget } from '@/components/workspace/editor-tabs/utils/editor-tab-close-targets'
import type { EditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import { MenuSurface } from '@/features/menus/components/surface'
import { useEditorTabMenu } from '@/features/workbench/hooks/use-editor-tab-menu'

export function EditorTabMenu({
  closeTargets,
  tab,
  trigger,
}: {
  readonly closeTargets: readonly EditorTabCloseTarget[]
  readonly tab: EditorTabModel
  readonly trigger: ReactElement
}) {
  const menu = useEditorTabMenu(tab, closeTargets)

  return <MenuSurface className='w-52' menu={menu} surface='editor.tab' trigger={trigger} />
}
