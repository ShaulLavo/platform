import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { EditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import { EditorStateProvider } from '@/features/editor/editor-state-provider'
import { EditorTabActionsContext } from '@/features/editor/providers/editor-tab-actions-context'
import { EditorTabBar } from '@/features/workbench/components/editor-tab-bar'
import { renderWithProviders } from '../../../../../test/render'

describe('EditorTabBar', () => {
  it('removes closed tabs from the DOM on the next render', () => {
    const { container, rerender } = renderWithProviders(<TestEditorTabs tabs={editorTabs()} />)

    expect(editorTabElement(container, 'tab-a')).toBeInTheDocument()

    rerender(<TestEditorTabs tabs={editorTabs().filter((tab) => tab.id !== 'tab-a')} />)

    expect(editorTabElement(container, 'tab-a')).toBeNull()
    expect(editorTabElement(container, 'tab-b')).toBeInTheDocument()
  })

  it('closes the clicked tab id', () => {
    const closeTab = vi.fn()

    renderWithProviders(<TestEditorTabs tabs={editorTabs()} onCloseTab={closeTab} />)

    fireEvent.click(screen.getByLabelText('Close src/a.ts'))

    expect(closeTab).toHaveBeenCalledWith('tab-a')
  })

  it('selects the clicked tab id', () => {
    const selectTab = vi.fn()

    const { container } = renderWithProviders(
      <TestEditorTabs tabs={editorTabs()} onSelectTab={selectTab} />,
    )

    fireEvent.click(editorTabElement(container, 'tab-b')!)

    expect(selectTab).toHaveBeenCalledWith('tab-b')
  })
})

function TestEditorTabs({
  tabs,
  onCloseTab = () => true,
  onSelectTab = () => undefined,
}: {
  readonly tabs: readonly EditorTabModel[]
  readonly onCloseTab?: (tabId: string) => boolean
  readonly onSelectTab?: (tabId: string) => void
}) {
  return (
    <EditorStateProvider>
      <EditorTabActionsContext
        value={{
          requestCloseTab: onCloseTab,
          reorderTab: () => false,
          selectTab: onSelectTab,
        }}
      >
        <EditorTabBar tabs={tabs} />
      </EditorTabActionsContext>
    </EditorStateProvider>
  )
}

function editorTabElement(container: HTMLElement, tabId: string) {
  return container.querySelector(`[data-editor-tab-id="${tabId}"]`)
}

function editorTabs(): EditorTabModel[] {
  return [
    editorTab({ active: true, id: 'tab-a', name: 'a.ts', path: 'src/a.ts' }),
    editorTab({ active: false, id: 'tab-b', name: 'b.ts', path: 'src/b.ts' }),
  ]
}

function editorTab({
  active,
  id,
  name,
  path,
}: {
  active: boolean
  id: string
  name: string
  path: string
}): EditorTabModel {
  return {
    active,
    copyPath: path,
    copyRelativePath: path,
    diffStatus: null,
    diffSuffix: '',
    icon: { name: 'typescript', src: '' },
    id,
    name,
    path,
    title: path,
  }
}
