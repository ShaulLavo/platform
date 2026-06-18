import { useRef } from 'react'

import { useChromeVisualTabs } from '@/components/workspace/editor-tabs/hooks/use-chrome-visual-tabs'
import { useEditorTabIntentPrefetch } from '@/components/workspace/editor-tabs/hooks/use-editor-tab-intent-prefetch'
import type { EditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import {
  chromeTabCloseBurstTargetId,
  chromeTabCloseTargetAfterClosingTab,
} from '@/components/workspace/editor-tabs/utils/editor-tab-close-retarget'
import { EditorTabButton } from '@/features/workbench/components/editor-tab-button'

export function EditorTabBar({
  tabs,
  onCloseTab,
  onSelectTab,
}: {
  readonly tabs: readonly EditorTabModel[]
  readonly onCloseTab: (tabId: string) => void
  readonly onSelectTab: (tabId: string) => void
}) {
  const tabListRef = useRef<HTMLDivElement | null>(null)
  const visualTabs = useChromeVisualTabs(
    tabs,
    true,
    sameEditorTabModel,
    'fixed-workbench-editor-tabs',
  )
  const closeBurstTargetId = chromeTabCloseBurstTargetId(visualTabs)

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
      {visualTabs.map((visualTab) => {
        const tab = visualTab.tab
        const closeTarget = closeTargetForVisualTab(visualTabs, visualTab, closeBurstTargetId)

        return (
          <EditorTabButton
            closeTarget={closeTarget}
            key={tab.id}
            phase={visualTab.phase}
            tab={tab}
            onCloseTab={onCloseTab}
            onSelectTab={onSelectTab}
          />
        )
      })}
    </div>
  )
}

function closeTargetForVisualTab(
  visualTabs: ReturnType<typeof useChromeVisualTabs<EditorTabModel>>,
  visualTab: ReturnType<typeof useChromeVisualTabs<EditorTabModel>>[number],
  closeBurstTargetId: EditorTabModel['id'] | null,
) {
  if (closeBurstTargetId === visualTab.tab.id) return visualTab.tab.id
  if (visualTab.phase !== 'closing') return null

  return chromeTabCloseTargetAfterClosingTab(visualTabs, visualTab.tab.id)
}

function sameEditorTabModel(left: EditorTabModel, right: EditorTabModel) {
  if (left.active !== right.active) return false
  if (left.copyPath !== right.copyPath) return false
  if (left.copyRelativePath !== right.copyRelativePath) return false
  if (left.diffSuffix !== right.diffSuffix) return false
  if (left.id !== right.id) return false
  if (left.icon.name !== right.icon.name) return false
  if (left.icon.src !== right.icon.src) return false
  if (left.name !== right.name) return false
  if (left.path !== right.path) return false
  if (left.title !== right.title) return false

  return sameDiffStatus(left, right)
}

function sameDiffStatus(left: EditorTabModel, right: EditorTabModel) {
  if (!left.diffStatus || !right.diffStatus) return left.diffStatus === right.diffStatus
  if (left.diffStatus.className !== right.diffStatus.className) return false
  if (left.diffStatus.label !== right.diffStatus.label) return false

  return left.diffStatus.title === right.diffStatus.title
}
