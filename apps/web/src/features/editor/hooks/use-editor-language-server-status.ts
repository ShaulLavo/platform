import { useSyncExternalStore } from 'react'

import type {
  EditorLanguageServerStatusSnapshot,
  EditorLanguageServerStatusSource,
} from '@/features/editor/state/language-server-status-source'

export function useEditorLanguageServerStatus(
  source: EditorLanguageServerStatusSource,
): EditorLanguageServerStatusSnapshot {
  return useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot)
}
