import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useState } from 'react'

import { FileTree } from '@workspace/tree/components/FileTree'
import { useFileTree } from '@workspace/tree/hooks/useFileTree'

let root: Root | null = null

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
})
