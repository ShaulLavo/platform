import { createEditorTextBuffer, createEditorViewSession } from '@singapor/core'
import { vi } from 'vitest'

import type { EditorRenderDocument } from '@/features/editor/utils/render-document'
import { FileEditorBody } from '@/features/workbench/components/file-editor-body'
import {
  EditorSurfaceActionsContext,
  type EditorSurfaceActions,
} from '@/features/workbench/providers/editor-surface-actions-context'
import { expect, test } from '../../../../../test/fixtures'
import { stubHighlightApi } from '../../../../../test/env/highlight-api'
import { renderWithProviders } from '../../../../../test/render'

test('a held document cannot publish its scroll position into the incoming tab', () => {
  stubHighlightApi()
  const outgoing = editorDocument('/repo/a.ts', 200, 1_962)
  const incoming = editorDocument('/repo/b.ts', 4, 0)
  const outgoingScroll = vi.fn<EditorSurfaceActions['setScrollPosition']>()
  const outgoingActions = editorActions(outgoingScroll)
  const incomingScroll = vi.fn((position) => incoming.view.setScrollPosition(position))
  const incomingActions = editorActions(incomingScroll)
  const rendered = renderWithProviders(
    body({ actions: outgoingActions, document: outgoing, path: outgoing.path, tabId: 'tab-a' }),
  )

  rendered.rerender(
    body({ actions: incomingActions, document: null, path: incoming.path, tabId: 'tab-b' }),
  )
  const outgoingPosition = outgoingScroll.mock.calls.at(-1)?.[0]
  expect(outgoingPosition).toBeDefined()

  rendered.rerender(
    body({ actions: incomingActions, document: incoming, path: incoming.path, tabId: 'tab-b' }),
  )

  expect(incomingScroll).not.toHaveBeenCalledWith(outgoingPosition)
  expect(incoming.view.getScrollPosition()).not.toEqual(outgoingPosition)
})

function body({
  actions,
  document,
  path,
  tabId,
}: {
  actions: EditorSurfaceActions
  document: EditorRenderDocument | null
  path: string
  tabId: string
}) {
  return (
    <EditorSurfaceActionsContext value={actions}>
      <div data-workbench>
        <FileEditorBody
          active={false}
          definitionTarget={null}
          editorKeymapLayers={[]}
          fileState={{ status: 'loading' }}
          languageServerReferences={null}
          liveDocument={document}
          path={path}
          rootPath='/repo'
          tabId={tabId}
        />
      </div>
    </EditorSurfaceActionsContext>
  )
}

function editorDocument(path: string, lines: number, scrollTop: number): EditorRenderDocument {
  const buffer = createEditorTextBuffer(
    Array.from({ length: lines }, (_, index) => `line ${index + 1}`).join('\n'),
  )
  const view = createEditorViewSession(buffer, `view:${path}`)
  view.setScrollPosition({ left: 0, top: scrollTop })
  return {
    buffer,
    editability: 'editable',
    id: path,
    path,
    view,
  }
}

function editorActions(
  setScrollPosition: EditorSurfaceActions['setScrollPosition'] = vi.fn(),
): EditorSurfaceActions {
  return {
    applyWorkspaceEdit: vi.fn(),
    closeReferences: vi.fn(),
    handleTextChange: vi.fn(),
    openDefinition: vi.fn(),
    openReferences: vi.fn(),
    previewReference: vi.fn(),
    setScrollPosition,
    setStatusSource: vi.fn(),
  }
}
