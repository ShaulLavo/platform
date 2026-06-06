import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'

import { FileTree } from '@workspace/tree/components/FileTree'
import { FileTree as FileTreeModel } from '@workspace/tree/utils/render/FileTree'

let root: Root | null = null
let model: FileTreeModel | null = null

afterEach(() => {
  model?.cleanUp()
  model = null
  flushSync(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

describe('FileTree browser behavior', () => {
  it('renders rows, scrolls, keeps sticky rows, handles keyboard focus, and starts rename', async () => {
    const { model: currentModel, shadowRoot } = await mountBrowserTree()
    const firstRow = rowButton(shadowRoot, 'src/features/')
    expect(firstRow.getAttribute('role')).toBe('treeitem')

    const changedRow = rowButton(shadowRoot, 'src/features/a-3.ts')
    expect(changedRow.dataset.itemGitStatus).toBe('modified')

    firstRow.focus()
    firstRow.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }))

    await vi.waitFor(() => {
      expect(activePath(shadowRoot)).toBe('src/features/a-0.ts')
    })

    const scrollElement = virtualScroll(shadowRoot)
    scrollElement.scrollTop = 120
    scrollElement.dispatchEvent(new Event('scroll', { bubbles: true }))

    await vi.waitFor(() => {
      expect(shadowRoot.querySelector('[data-file-tree-sticky-path="src/features/"]')).toBeTruthy()
      expect(virtualRoot(shadowRoot).dataset.scrollAtTop).toBeUndefined()
    })

    currentModel.startRenaming('src/features/a-3.ts')

    await vi.waitFor(() => {
      const input = shadowRoot.querySelector<HTMLInputElement>('[data-item-rename-input]')
      expect(input?.value).toBe('a-3.ts')
    })
  })

  it('preserves scroll position when selecting a visible row by pointer', async () => {
    const { model: currentModel, shadowRoot } = await mountBrowserTree()
    const scrollElement = virtualScroll(shadowRoot)
    scrollElement.scrollTop = 120
    scrollElement.dispatchEvent(new Event('scroll', { bubbles: true }))

    await vi.waitFor(() => {
      expect(rowButton(shadowRoot, 'src/features/a-8.ts')).toBeTruthy()
    })

    const previousScrollTop = scrollElement.scrollTop
    rowButton(shadowRoot, 'src/features/a-8.ts').dispatchEvent(
      new MouseEvent('click', { bubbles: true, detail: 1 }),
    )

    await vi.waitFor(() => {
      expect(currentModel.getSelectedPaths()).toEqual(['src/features/a-8.ts'])
      expect(currentModel.getFocusedPath()).toBe('src/features/a-8.ts')
    })
    expect(scrollElement.scrollTop).toBe(previousScrollTop)
  })
})

async function mountBrowserTree() {
  const container = document.createElement('main')
  container.style.height = '180px'
  container.style.width = '360px'
  document.body.append(container)
  root = createRoot(container)
  const mountedModel = new FileTreeModel({
    gitStatus: [{ path: 'src/features/a-3.ts', status: 'modified' }],
    initialExpansion: 'open',
    initialVisibleRowCount: 6,
    itemHeight: 24,
    paths: browserPaths(),
    renaming: true,
    stickyFolders: true,
  })
  model = mountedModel

  flushSync(() => {
    root?.render(
      <FileTree
        aria-label='Files'
        model={mountedModel}
        style={{ display: 'block', height: '180px', width: '360px' }}
      />,
    )
  })

  return { model: mountedModel, shadowRoot: await waitForShadowRoot() }
}

function browserPaths() {
  const paths = ['src/', 'src/features/']

  for (let index = 0; index < 28; index += 1) {
    paths.push(`src/features/a-${index}.ts`)
  }

  return paths
}

async function waitForShadowRoot() {
  await vi.waitFor(() => {
    expect(document.querySelector('file-tree-container')?.shadowRoot).toBeTruthy()
  })

  const shadowRoot = document.querySelector('file-tree-container')?.shadowRoot
  if (!shadowRoot) throw new Error('missing file tree shadow root')

  return shadowRoot
}

function rowButton(shadowRoot: ShadowRoot, path: string) {
  const button = shadowRoot.querySelector<HTMLButtonElement>(
    `button[data-item-path="${path}"]:not([data-file-tree-sticky-row="true"])`,
  )
  if (!button) throw new Error(`missing row ${path}`)

  return button
}

function activePath(shadowRoot: ShadowRoot) {
  const activeElement = shadowRoot.activeElement
  if (!(activeElement instanceof HTMLElement)) return null

  return activeElement.dataset.itemPath ?? null
}

function virtualRoot(shadowRoot: ShadowRoot) {
  const rootElement = shadowRoot.querySelector<HTMLElement>(
    '[data-file-tree-virtualized-root="true"]',
  )
  if (!rootElement) throw new Error('missing virtual root')

  return rootElement
}

function virtualScroll(shadowRoot: ShadowRoot) {
  const scrollElement = shadowRoot.querySelector<HTMLElement>(
    '[data-file-tree-virtualized-scroll="true"]',
  )
  if (!scrollElement) throw new Error('missing virtual scroll')

  return scrollElement
}
