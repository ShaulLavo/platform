import { renderHook } from '@testing-library/react'

import type { EditorRenderDocument } from '@/features/editor/utils/render-document'
import { useHeldLiveDocument } from '@/features/workbench/hooks/use-held-live-document'
import { expect, test } from '../../../../test/fixtures'

function document(path: string): EditorRenderDocument {
  return { buffer: {}, id: path, path, view: {} } as unknown as EditorRenderDocument
}

function renderHeld(liveDocument: EditorRenderDocument | null, holding: boolean) {
  return renderHook(
    ({ live, hold }: { live: EditorRenderDocument | null; hold: boolean }) =>
      useHeldLiveDocument(live, hold),
    { initialProps: { live: liveDocument, hold: holding } },
  )
}

test('the open document stays drawn while the next one is still being read', () => {
  const open = document('a.ts')
  const { result, rerender } = renderHeld(open, true)
  expect(result.current).toEqual({ current: true, document: open })

  rerender({ live: null, hold: true })
  expect(result.current).toEqual({ current: false, document: open })

  const next = document('b.ts')
  rerender({ live: next, hold: true })
  expect(result.current).toEqual({ current: true, document: next })
})

test('nothing is held once there is no document on the way', () => {
  const open = document('a.ts')
  const { result, rerender } = renderHeld(open, true)

  rerender({ live: null, hold: false })
  expect(result.current).toEqual({ current: false, document: null })
})

test('a document held through a gap is dropped rather than redrawn later', () => {
  const open = document('a.ts')
  const { result, rerender } = renderHeld(open, true)

  rerender({ live: null, hold: false })
  expect(result.current).toEqual({ current: false, document: null })

  rerender({ live: null, hold: true })
  expect(result.current).toEqual({ current: false, document: null })
})
