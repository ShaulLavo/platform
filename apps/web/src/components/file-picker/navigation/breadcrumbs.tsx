import { CaretRightIcon } from '@phosphor-icons/react'
import { cn } from '@workspace/ui/lib/utils'
import { Fragment } from 'react'

import { pathCrumbs } from '../state'

export function Breadcrumbs({
  currentPath,
  onNavigate,
}: {
  currentPath: string
  onNavigate: (path: string) => void
}) {
  const crumbs = pathCrumbs(currentPath)

  return (
    <div className='flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-xs'>
      {crumbs.map((crumb, index) => (
        <Fragment key={crumb.path || 'root'}>
          {index > 0 && <CaretRightIcon className='text-muted-foreground size-3 shrink-0' />}
          <button
            className={cn(
              'min-w-0 shrink truncate rounded-sm px-1.5 py-1 text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50',
              crumb.path === currentPath && 'text-foreground',
            )}
            onClick={() => onNavigate(crumb.path)}
            type='button'
          >
            {crumb.label}
          </button>
        </Fragment>
      ))}
    </div>
  )
}
