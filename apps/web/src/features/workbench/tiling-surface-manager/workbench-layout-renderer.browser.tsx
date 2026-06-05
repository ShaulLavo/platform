import '@workspace/ui/globals.css'

import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@workspace/ui/components/tooltip'

import { createClassicFirstRunWorkspaceLayout } from './layout-builders'
import { WorkbenchLayoutProvider } from './workbench-layout-provider'
import { WorkbenchLayoutRenderer } from './workbench-layout-renderer'

const THEME_STORAGE_KEY = 'platform-workbench-layout-renderer-browser-theme'

let root: Root | null = null

afterEach(() => {
  if (root) {
    flushSync(() => root?.unmount())
    root = null
  }

  document.body.innerHTML = ''
  localStorage.removeItem(THEME_STORAGE_KEY)
})

describe('WorkbenchLayoutRenderer browser rendering', () => {
  it('renders nonblank windows and keeps tab focusable', async () => {
    const container = document.createElement('main')
    container.style.height = '620px'
    container.style.width = '920px'
    document.body.append(container)
    root = createRoot(container)

    flushSync(() => {
      root?.render(
        <ThemeProvider defaultTheme='dark' storageKey={THEME_STORAGE_KEY}>
          <TooltipProvider delay={0}>
            <WorkbenchLayoutProvider initialLayout={createClassicFirstRunWorkspaceLayout()}>
              <WorkbenchLayoutRenderer />
            </WorkbenchLayoutProvider>
          </TooltipProvider>
        </ThemeProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(windowRegions()).toHaveLength(3)
      expect(document.body.textContent).toContain('No file selected')
      expect(firstWindowRect().width).toBeGreaterThan(100)
      expect(firstWindowRect().height).toBeGreaterThan(100)
    })

    const tab = firstTab()
    tab.focus()

    expect(document.activeElement).toBe(tab)
  })
})

function windowRegions() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-window-id]'))
}

function firstWindowRect() {
  const firstWindow = windowRegions()[0]
  if (!firstWindow) throw new Error('Missing workbench window')

  return firstWindow.getBoundingClientRect()
}

function firstTab() {
  const tab = document.querySelector<HTMLElement>('[role="tab"]')
  if (!tab) throw new Error('Missing workbench tab')

  return tab
}
