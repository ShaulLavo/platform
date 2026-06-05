import {
  createEditorTextBuffer,
  createEditorViewSession,
  type EditorTextBuffer,
  type EditorViewSession,
} from '@editor/core'

import type { WorkbenchSpikePanel } from '@/features/workbench-spike/workbench-spike-types'

type WorkbenchSpikeEditorSession = {
  readonly buffer: EditorTextBuffer
  readonly documentId: string
  readonly view: EditorViewSession
}

const editorSessions = new Map<string, WorkbenchSpikeEditorSession>()

export function workbenchSpikeEditorSession(panel: WorkbenchSpikePanel) {
  const existing = editorSessions.get(panel.id)
  if (existing) return existing

  const buffer = createEditorTextBuffer(panel.fixtureText ?? '')
  const session = {
    buffer,
    documentId: `spike:${panel.id}`,
    view: createEditorViewSession(buffer, `spike-view:${panel.id}`),
  }
  editorSessions.set(panel.id, session)
  return session
}
