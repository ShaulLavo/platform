import { CaretRightIcon } from '@phosphor-icons/react'
import { cn } from '@workspace/ui/lib/utils'
import { Fragment } from 'react'

import { useFilePickerSessionActions } from '@/features/file-picker/hooks/use-file-picker-session-actions'
import { pathCrumbs } from '@/features/file-picker/model'

export function Breadcrumbs({ currentPath }: { currentPath: string }) {
  const { navigateTo } = useFilePickerSessionActions()
  const crumbs = pathCrumbs(currentPath)

  return (
    <div className='flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-xs'>
      {crumbs.map((crumb, index) => (
        <Fragment key={crumb.path || 'root'}>
          {index > 0 && <CaretRightIcon className='text-muted-foreground size-3 shrink-0' />}
          <button
            className={cn(
              'compact:px-1.5 compact:py-1 min-w-0 shrink truncate rounded-sm px-2 py-1.5 text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50',
              crumb.path === currentPath && 'text-foreground',
            )}
            onClick={() => navigateTo(crumb.path)}
            type='button'
          >
            {crumb.label}
          </button>
        </Fragment>
      ))}
    </div>
  )
}
