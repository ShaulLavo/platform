import type { LanguageServerDiagnosticSummary, LanguageServerStatus } from '@singapor/lsp-plugin'

export type EditorLanguageServerStatusSnapshot = {
  diagnostics: LanguageServerDiagnosticSummary | null
  status: LanguageServerStatus
}

export type EditorLanguageServerStatusSource = {
  getSnapshot: () => EditorLanguageServerStatusSnapshot
  reset: () => void
  setDiagnostics: (diagnostics: LanguageServerDiagnosticSummary | null) => void
  setSnapshot: (snapshot: EditorLanguageServerStatusSnapshot) => void
  setStatus: (status: LanguageServerStatus) => void
  subscribe: (listener: () => void) => () => void
}

const idleLanguageServerStatusSnapshot: EditorLanguageServerStatusSnapshot = {
  diagnostics: null,
  status: 'idle',
}

export function createEditorLanguageServerStatusSource(): EditorLanguageServerStatusSource {
  let snapshot = idleLanguageServerStatusSnapshot
  const listeners = new Set<() => void>()

  function update(next: EditorLanguageServerStatusSnapshot) {
    if (languageServerStatusSnapshotsEqual(snapshot, next)) return

    snapshot = next
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot: () => snapshot,
    reset: () => update(idleLanguageServerStatusSnapshot),
    setDiagnostics: (diagnostics) => update({ ...snapshot, diagnostics }),
    setSnapshot: update,
    setStatus: (status) => update({ ...snapshot, status }),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

function languageServerStatusSnapshotsEqual(
  current: EditorLanguageServerStatusSnapshot,
  next: EditorLanguageServerStatusSnapshot,
) {
  return current.diagnostics === next.diagnostics && current.status === next.status
}
