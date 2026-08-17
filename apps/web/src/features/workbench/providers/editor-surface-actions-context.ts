import { createContext } from 'react'

import type { EditorStatusBarSource } from '@/features/editor/state/status-bar-source'
import type { DocumentSessionChange, EditorScrollPosition } from '@singapor/core'
import type {
  LanguageServerDefinitionTarget,
  LanguageServerReferencesResult,
} from '@singapor/lsp-plugin'

export type EditorSurfaceActions = {
  readonly closeReferences: () => void
  readonly openDefinition: (target: LanguageServerDefinitionTarget) => void | boolean
  readonly openReferences: (result: LanguageServerReferencesResult) => void | boolean
  readonly previewReference: (target: LanguageServerDefinitionTarget) => void
  readonly recordTextChange: (tabId: string, path: string, change: DocumentSessionChange) => void
  readonly setDirtyState: (path: string, dirty: boolean) => void
  readonly setScrollPosition: (scrollPosition: EditorScrollPosition) => void
  readonly setStatusSource: (source: EditorStatusBarSource | null) => void
}

export const EditorSurfaceActionsContext = createContext<EditorSurfaceActions | null>(null)
