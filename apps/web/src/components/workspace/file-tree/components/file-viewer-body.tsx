import { WarningCircleIcon } from '@phosphor-icons/react'

import { Editor } from '@/features/editor/components/editor'
import { LanguageServerReferencesPane } from '@/features/editor/components/language-server-references-pane'
import type { EditorRenderDocument } from '@/features/editor/editor-render-document'
import type { EditorStatusBarSource } from '@/features/editor/state/editor-status-bar-source'
import type { FileResult } from '@/lib/file-system-types'
import type { LoadState } from '@/lib/load-state'
import type { DocumentSessionChange, EditorKeymapLayer, EditorScrollPosition } from '@editor/core'
import type {
  LanguageServerDefinitionTarget,
  LanguageServerReferencesResult,
} from '@editor/lsp-plugin'

export function FileViewerBody({
  active,
  liveDocument,
  definitionTarget,
  editorKeymapLayers,
  fileState,
  languageServerReferences,
  rootPath,
  tabId,
  onEditorDirtyChange,
  onEditorScrollPositionChange,
  onEditorStatusSourceChange,
  onEditorTextChange,
  onOpenDefinition,
  onOpenReferences,
  onReferencesClose,
}: {
  active: boolean
  liveDocument: EditorRenderDocument | null
  definitionTarget: LanguageServerDefinitionTarget | null
  editorKeymapLayers: readonly EditorKeymapLayer[]
  fileState: LoadState<FileResult>
  languageServerReferences: LanguageServerReferencesResult | null
  rootPath: string
  tabId: string
  onEditorDirtyChange?: (path: string, dirty: boolean) => void
  onEditorScrollPositionChange: (tabId: string, scrollPosition: EditorScrollPosition) => void
  onEditorStatusSourceChange: (source: EditorStatusBarSource | null) => void
  onEditorTextChange?: (tabId: string, path: string, change: DocumentSessionChange) => void
  onOpenDefinition: (target: LanguageServerDefinitionTarget) => void | boolean
  onOpenReferences: (result: LanguageServerReferencesResult) => void | boolean
  onReferencesClose: () => void
}) {
  if (liveDocument) {
    return (
      <div
        className={
          languageServerReferences
            ? 'grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_minmax(260px,340px)] grid-rows-[minmax(0,1fr)] overflow-hidden'
            : 'grid h-full min-h-0 min-w-0 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden'
        }
      >
        <Editor
          active={active}
          definitionTarget={definitionTarget}
          document={liveDocument}
          keymapLayers={editorKeymapLayers}
          rootPath={rootPath}
          tabId={tabId}
          onDirtyChange={onEditorDirtyChange}
          onScrollPositionChange={(_path, scrollPosition) =>
            onEditorScrollPositionChange(tabId, scrollPosition)
          }
          onStatusSourceChange={onEditorStatusSourceChange}
          onTextChange={onEditorTextChange}
          onOpenDefinition={onOpenDefinition}
          onOpenReferences={onOpenReferences}
        />
        {languageServerReferences ? (
          <LanguageServerReferencesPane
            references={languageServerReferences}
            rootPath={rootPath}
            onClose={onReferencesClose}
            onOpenReference={onOpenDefinition}
          />
        ) : null}
      </div>
    )
  }

  if (fileState.status === 'error') {
    return (
      <div className='text-muted-foreground flex min-h-0 items-center justify-center p-6 text-xs'>
        <WarningCircleIcon className='mr-2 size-4' />
        {fileState.message}
      </div>
    )
  }

  return null
}
