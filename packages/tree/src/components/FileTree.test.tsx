import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useState } from 'react'

import { FileTree } from '@workspace/tree/components/FileTree'
import { useFileTree } from '@workspace/tree/hooks/useFileTree'
import type { FileTreeIcons } from '@workspace/tree/utils/iconConfig'
import type { GitStatusEntry } from '@workspace/tree/utils/publicTypes'
import { FileTree as FileTreeModel } from '@workspace/tree/utils/render/FileTree'

let root: Root | null = null

const ICON_FALLBACK_CASES = [
  {
    expectedTypeScriptIcon: '#file-tree-builtin-typescript',
    set: 'standard',
  },
  {
    expectedTypeScriptIcon: '#test-generic-file',
    set: 'minimal',
  },
] as const

afterEach(() => {
  flushSync(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

describe('FileTree React integration', () => {
  it('renders the model and reports selection changes', async () => {
    const container = document.createElement('main')
    document.body.append(container)
    root = createRoot(container)

    function Harness() {
      const [selectedPaths, setSelectedPaths] = useState<readonly string[]>(['src/a.ts'])
      const { model } = useFileTree({
        initialExpansion: 'open',
        initialSelectedPaths: ['src/a.ts'],
        onSelectionChange: setSelectedPaths,
        paths: ['src/', 'src/a.ts', 'src/b.ts'],
      })

      return (
        <>
          <FileTree aria-label='Files' model={model} />
          <output data-testid='selection'>{selectedPaths.join(',')}</output>
          <button type='button' onClick={() => model.getItem('src/b.ts')?.select()}>
            Select B
          </button>
        </>
      )
    }

    flushSync(() => root?.render(<Harness />))

    await vi.waitFor(() => {
      expect(document.querySelector('file-tree-container')?.shadowRoot).toBeTruthy()
      expect(document.querySelector('[data-testid="selection"]')?.textContent).toBe('src/a.ts')
    })

    document.querySelector('button')?.click()

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="selection"]')?.textContent).toBe(
        'src/a.ts,src/b.ts',
      )
    })
  })

  it('syncs git status option changes into the stable model', async () => {
    const container = document.createElement('main')
    document.body.append(container)
    root = createRoot(container)

    function Harness() {
      const [gitStatus, setGitStatus] = useState<readonly GitStatusEntry[]>([])
      const { model } = useFileTree({
        gitStatus,
        initialExpansion: 'open',
        paths: ['src/', 'src/a.ts'],
      })

      return (
        <>
          <FileTree aria-label='Files' model={model} />
          <button
            data-testid='set-git-status'
            type='button'
            onClick={() => setGitStatus([{ path: 'src/a.ts', status: 'modified' }])}
          >
            Set Git Status
          </button>
        </>
      )
    }

    flushSync(() => root?.render(<Harness />))
    const shadowRoot = await waitForShadowRoot()
    expect(rowButton(shadowRoot, 'src/a.ts').dataset.itemGitStatus).toBeUndefined()

    clickButton('set-git-status')

    await vi.waitFor(() => {
      expect(rowButton(shadowRoot, 'src/a.ts').dataset.itemGitStatus).toBe('modified')
    })
  })

  it('syncs icon option changes into the stable model', async () => {
    const container = document.createElement('main')
    document.body.append(container)
    root = createRoot(container)

    function Harness() {
      const [icons, setIcons] = useState<FileTreeIcons>(() => fileIconRemap('first-file-icon'))
      const { model } = useFileTree({
        icons,
        initialExpansion: 'open',
        paths: ['src/', 'src/a.ts'],
      })

      return (
        <>
          <FileTree aria-label='Files' model={model} />
          <button
            data-testid='set-icons'
            type='button'
            onClick={() => setIcons(fileIconRemap('second-file-icon'))}
          >
            Set Icons
          </button>
        </>
      )
    }

    flushSync(() => root?.render(<Harness />))
    const shadowRoot = await waitForShadowRoot()
    expect(fileIconHref(shadowRoot, 'src/a.ts')).toBe('#first-file-icon')

    clickButton('set-icons')

    await vi.waitFor(() => {
      expect(fileIconHref(shadowRoot, 'src/a.ts')).toBe('#second-file-icon')
    })
  })

  it.each(ICON_FALLBACK_CASES)(
    'uses the generic file remap as the $set fallback',
    async ({ expectedTypeScriptIcon, set }) => {
      const container = document.createElement('main')
      document.body.append(container)
      root = createRoot(container)
      const treeModel = new FileTreeModel({
        icons: {
          remap: { 'file-tree-icon-file': 'test-generic-file' },
          set,
        },
        initialExpansion: 'open',
        paths: ['unknown.xyz', 'src/index.ts'],
      })

      flushSync(() => root?.render(<FileTree aria-label='Files' model={treeModel} />))
      const shadowRoot = await waitForShadowRoot()

      expect(fileIconHref(shadowRoot, 'unknown.xyz')).toBe('#test-generic-file')
      expect(fileIconHref(shadowRoot, 'src/index.ts')).toBe(expectedTypeScriptIcon)
      treeModel.cleanUp()
    },
  )
})

function fileIconRemap(iconName: string): FileTreeIcons {
  return {
    remap: {
      'file-tree-icon-file': iconName,
    },
    set: 'none',
  }
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
  const button = shadowRoot.querySelector<HTMLButtonElement>(`button[data-item-path="${path}"]`)
  if (!button) throw new Error(`missing row ${path}`)

  return button
}

function fileIconHref(shadowRoot: ShadowRoot, path: string) {
  const iconUse = rowButton(shadowRoot, path).querySelector<SVGUseElement>(
    '[data-item-section="icon"] use',
  )
  if (!iconUse) throw new Error(`missing file icon ${path}`)

  return iconUse.getAttribute('href')
}

function clickButton(testId: string) {
  const button = document.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)
  if (!button) throw new Error(`missing button ${testId}`)

  button.click()
}
