import type { EditorScrollPosition, EditorTextBuffer, EditorViewSession } from '@singapor/core'

export type EditorRenderDocument = {
  readonly buffer: EditorTextBuffer
  readonly contentRevision?: string
  readonly id: string
  readonly path: string
  readonly scrollPosition?: EditorScrollPosition
  readonly view: EditorViewSession
}
