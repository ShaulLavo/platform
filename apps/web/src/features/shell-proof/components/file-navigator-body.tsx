import { FileCodeIcon } from '@phosphor-icons/react'

import { FAKE_FILE_PATHS } from '@/features/shell-proof/utils/seed'
import { useLayoutState } from '@/features/workbench/hooks/use-layout-state'
import { createFileEditorSurface } from '@workspace/tiling/utils/layout-builders'
import { fileEditorSurfaceId } from '@workspace/tiling/utils/layout-ids'
import type { WorkspaceLayout } from '@workspace/tiling/utils/layout-types'
import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'

export function FileNavigatorBody() {
  const layout = useLayoutState((state) => state.layout)
  const dispatchLayoutOperation = useLayoutState((state) => state.dispatchLayoutOperation)

  function openFile(path: string) {
    dispatchLayoutOperation({
      surface: createFileEditorSurface({ path }),
      type: 'openSurface',
    })
  }

  return (
    <div className='bg-background/60 flex h-full min-h-0 flex-col p-3'>
      <div className='text-muted-foreground mb-2 shrink-0 text-xs font-medium'>Fake workspace</div>
      <div className='flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto'>
        {FAKE_FILE_PATHS.map((path) => {
          const state = fileState(layout, path)

          return (
            <Button
              aria-label={`Open ${path}`}
              className={cn(
                'h-7 w-full justify-start gap-2 rounded-sm px-2 text-left font-normal',
                state === 'active' && 'bg-accent text-accent-foreground',
                state === 'open' && 'text-foreground',
              )}
              data-shell-proof-file-path={path}
              data-shell-proof-file-state={state}
              key={path}
              size='sm'
              type='button'
              variant='ghost'
              onClick={() => openFile(path)}
            >
              <FileCodeIcon className='size-3.5 shrink-0' />
              <span className='truncate'>{path}</span>
            </Button>
          )
        })}
      </div>
    </div>
  )
}

function fileState(layout: WorkspaceLayout, path: string): 'active' | 'closed' | 'open' {
  const surfaceId = fileEditorSurfaceId(path)
  if (layout.activeSurfaceId === surfaceId) return 'active'
  if (layout.surfacesById[surfaceId]) return 'open'

  return 'closed'
}
