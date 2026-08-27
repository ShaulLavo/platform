import { useState } from 'react'

import type { EditorRenderDocument } from '@/features/editor/utils/render-document'

export type HeldLiveDocumentState = {
  readonly current: boolean
  readonly document: EditorRenderDocument | null
}

/**
 * Keeps the outgoing document mounted while the next one loads, preserving the warm editor.
 * `current` is false while held so incoming-tab callbacks cannot bind to the outgoing document.
 */
export function useHeldLiveDocument(
  liveDocument: EditorRenderDocument | null,
  holding: boolean,
): HeldLiveDocumentState {
  const [held, setHeld] = useState<EditorRenderDocument | null>(null)

  if (liveDocument !== null && held !== liveDocument) setHeld(liveDocument)
  if (liveDocument === null && !holding && held !== null) setHeld(null)

  return {
    current: liveDocument !== null,
    document: liveDocument ?? held,
  }
}
