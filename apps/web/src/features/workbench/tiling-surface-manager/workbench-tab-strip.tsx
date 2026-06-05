import { useRef } from 'react'

import { ChromeTabCloseButton } from '@/components/workspace/chrome-tab-close-button'
import { chromeTabLayout } from '@/components/workspace/chrome-tab-layout'
import { ChromeTabSelectButton } from '@/components/workspace/chrome-tab-select-button'
import { chromeTabRootClassName } from '@/components/workspace/chrome-tab-style'
import { useElementWidth } from '@/components/workspace/use-element-width'
import { cn } from '@workspace/ui/lib/utils'

import { surfacePanelId } from './workbench-surface-host'
import { WorkbenchSurfaceIcon } from './workbench-surface-icon'
import { workbenchChromeTabStyle } from './workbench-tab-style'
import type { LayoutOperation, Surface, WorkbenchWindow } from './layout-types'

export function WorkbenchTabStrip({
  surfaces,
  window,
  onDispatch,
}: {
  readonly surfaces: readonly Surface[]
  readonly window: WorkbenchWindow
  readonly onDispatch: (operation: LayoutOperation) => void
}) {
  const tabListRef = useRef<HTMLDivElement | null>(null)
  const availableWidth = useElementWidth(tabListRef)
  const activeIndex = surfaces.findIndex((surface) => surface.id === window.activeSurfaceId)
  const layout =
    availableWidth === null
      ? null
      : chromeTabLayout({
          activeIndex,
          availableWidth,
          tabCount: surfaces.length,
        })

  return (
    <div
      aria-label='Window tabs'
      className='flex min-h-0 min-w-0 flex-1 items-end overflow-hidden'
      ref={tabListRef}
      role='tablist'
    >
      <div className='flex min-w-full items-end overflow-visible'>
        {surfaces.map((surface, index) => {
          const active = surface.id === window.activeSurfaceId

          return (
            <div
              className={chromeTabRootClassName({
                active,
                className: cn(
                  'z-[var(--chrome-tab-z)] border border-transparent',
                  active && 'border-border/60 shadow-sm',
                ),
              })}
              data-chrome-tab-root=''
              data-surface-tab-id={surface.id}
              key={surface.id}
              style={workbenchChromeTabStyle({
                active,
                index,
                overlap: layout?.overlap ?? 0,
                width: layout?.tabs[index]?.width ?? null,
              })}
            >
              <ChromeTabSelectButton
                aria-controls={surfacePanelId(surface.id)}
                aria-selected={active}
                role='tab'
                title={surface.title}
                onClick={() => onDispatch(selectSurfaceOperation(window, surface))}
              >
                <WorkbenchSurfaceIcon className='size-3.5 shrink-0' type={surface.type} />
                <span className='min-w-0 truncate'>{surface.title}</span>
              </ChromeTabSelectButton>
              <div className='flex h-full w-7 shrink-0 items-center justify-center'>
                <ChromeTabCloseButton
                  aria-label={`Close ${surface.title}`}
                  className={cn(
                    'size-5 opacity-0 group-focus-within/chrome-tab:opacity-100 group-hover/chrome-tab:opacity-100',
                    active && 'opacity-100',
                    !surface.capabilities.canClose && 'pointer-events-none opacity-30',
                  )}
                  disabled={!surface.capabilities.canClose}
                  title={`Close ${surface.title}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onDispatch({ surfaceId: surface.id, type: 'closeSurface' })
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function selectSurfaceOperation(window: WorkbenchWindow, surface: Surface): LayoutOperation {
  return {
    index: window.surfaceIds.indexOf(surface.id),
    surfaceId: surface.id,
    targetWindowId: window.id,
    type: 'tabSurface',
  }
}
