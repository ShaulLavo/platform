import type { EditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import { cn } from '@workspace/ui/lib/utils'

export function ChromeTabTitle({ tab }: { tab: EditorTabModel }) {
  return (
    <span className='flex min-w-0 items-baseline gap-1 overflow-hidden whitespace-nowrap'>
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
