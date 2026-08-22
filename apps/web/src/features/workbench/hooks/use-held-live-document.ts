import { useState } from 'react'

import type { EditorRenderDocument } from '@/features/editor/utils/render-document'

/**
 * What the pane draws while the next document loads. Opening a file leaves the live document null
 * between the click and the read landing, and drawing nothing there unmounts the editor — so the
 * arriving document pays for a fresh instance, text metrics and minimap worker rather than taking a
 * session on the warm one. `holding` is false wherever there is no next document to wait for.
 */
export function useHeldLiveDocument(
  liveDocument: EditorRenderDocument | null,
  holding: boolean,
): EditorRenderDocument | null {
  const [held, setHeld] = useState<EditorRenderDocument | null>(null)

  if (liveDocument !== null && held !== liveDocument) setHeld(liveDocument)
  if (liveDocument === null && !holding && held !== null) setHeld(null)

  return liveDocument ?? held
}
