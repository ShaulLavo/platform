import { useEditorTabDirty } from '@/components/workspace/editor-tabs/hooks/use-editor-tab-dirty'
import type { EditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import { TabTrailingSlot } from '@/features/workbench/components/tab-trailing-slot'
import { fileIconStyle } from '@/lib/file-icon-style'
import { cn } from '@workspace/ui/lib/utils'

export function EditorTabButton({
  closeTarget,
  phase,
  tab,
  onCloseTab,
  onSelectTab,
}: {
  readonly closeTarget: string | null
  readonly phase: 'closing' | 'opening' | 'present'
  readonly tab: EditorTabModel
  readonly onCloseTab: (tabId: string) => void
  readonly onSelectTab: (tabId: string) => void
}) {
  const dirty = useEditorTabDirty(tab.path)

  function selectTab() {
    if (phase !== 'closing') {
      onSelectTab(tab.id)
      return
    }
    if (!closeTarget) return

    onCloseTab(closeTarget)
  }

  return (
    <button
      aria-selected={tab.active}
      className={cn(
        'group/proof-tab flex h-9 w-36 min-w-24 max-w-48 shrink-0 items-center gap-1.5 rounded-t-md border px-2 text-left text-xs shadow-sm outline-none transition-[background-color,border-color,opacity,box-shadow] focus-visible:ring-1 focus-visible:ring-ring/50',
        tab.active
          ? 'border-border text-foreground'
          : 'border-transparent text-muted-foreground hover:bg-muted',
        phase === 'opening' && 'opacity-0',
        phase === 'closing' && 'opacity-0',
      )}
      data-editor-tab-id={tab.id}
      data-editor-tab-path={tab.path}
      data-editor-tab-phase={phase}
      role='tab'
      title={tab.title}
      type='button'
      onClick={selectTab}
    >
      <span
        aria-hidden='true'
        className='size-3.5 shrink-0 object-contain'
        style={fileIconStyle(tab.icon)}
      />
      {editorTabTitle(tab)}
      <TabTrailingSlot
        active={tab.active}
        canClose
        dirty={dirty}
        forceVisible={closeTarget === tab.id}
        orientation='horizontal'
        title={tab.title}
        onClose={() => onCloseTab(closeTarget ?? tab.id)}
      />
    </button>
  )
}

function editorTabTitle(tab: EditorTabModel) {
  return (
    <span className='flex min-w-0 flex-1 items-baseline gap-1 overflow-hidden whitespace-nowrap'>
      <span className='min-w-0 shrink truncate'>{tab.name}</span>
      {tab.diffSuffix ? (
        <span
          aria-hidden='true'
          className={cn(
            'shrink-0 text-xs leading-none font-semibold tabular-nums',
            tab.diffStatus?.className ?? 'text-muted-foreground',
          )}
          title={tab.diffStatus?.title}
        >
          {tab.diffSuffix}
        </span>
      ) : null}
    </span>
  )
}
