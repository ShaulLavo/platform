import { useRef } from 'react'

import { useEditorTabIntentPrefetch } from '@/components/workspace/editor-tabs/hooks/use-editor-tab-intent-prefetch'
import type { EditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import { EditorTabButton } from '@/features/workbench/components/editor-tab-button'

export function EditorTabBar({ tabs }: { readonly tabs: readonly EditorTabModel[] }) {
  const tabListRef = useRef<HTMLDivElement | null>(null)

  useEditorTabIntentPrefetch({
    enabled: true,
    tabListRef,
    tabs,
  })

  return (
    <div
      aria-label='Editor tabs'
      className='border-border flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b px-2 pt-1'
      ref={tabListRef}
      role='tablist'
    >
      {tabs.map((tab) => {
        return <EditorTabButton key={tab.id} tab={tab} />
      })}
    </div>
  )
}
