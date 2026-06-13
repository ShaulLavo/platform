import type { WorkbenchTabModel } from '@/features/workbench/utils/tab-model'
import { cn } from '@workspace/ui/lib/utils'

export function TabTitle({
  orientation,
  tab,
}: {
  readonly orientation: 'horizontal' | 'vertical'
  readonly tab: WorkbenchTabModel
}) {
  const editorTab = tab.editorTab
  if (!editorTab) {
    return (
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          orientation === 'vertical' && 'min-h-0 [writing-mode:vertical-rl]',
        )}
      >
        {tab.surface.title}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'flex min-w-0 flex-1 items-baseline gap-1 overflow-hidden whitespace-nowrap',
        orientation === 'vertical' && 'min-h-0 [writing-mode:vertical-rl]',
      )}
    >
      <span className='min-w-0 shrink truncate'>{editorTab.name}</span>
      {editorTab.diffSuffix ? (
        <span
          aria-hidden='true'
          className={cn(
            'shrink-0 text-xs leading-none font-semibold tabular-nums',
            editorTab.diffStatus?.className ?? 'text-muted-foreground',
          )}
          title={editorTab.diffStatus?.title}
        >
          {editorTab.diffSuffix}
        </span>
      ) : null}
    </span>
  )
}
