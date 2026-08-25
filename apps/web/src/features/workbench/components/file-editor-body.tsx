import { WarningCircleIcon } from '@phosphor-icons/react'

import { CompareSavedView } from '@/features/editor/components/compare-saved-view'
import { parseCompareSavedDocumentId } from '@/features/editor/utils/compare-saved-document'
import { Editor } from '@/features/editor/components/editor'
import { LanguageServerReferencesPane } from '@/features/editor/components/language-server-references-pane'
import type { EditorRenderDocument } from '@/features/editor/utils/render-document'
import { DiffView } from '@/features/git/components/diff-view'
import { parseDiffDocumentId } from '@/features/git/utils/diff-document'
import { useEditorSurfaceActions } from '@/features/workbench/hooks/use-editor-surface-actions'
import { useHeldLiveDocument } from '@/features/workbench/hooks/use-held-live-document'
import type { FileResult } from '@/lib/file-system-types'
import type { LoadState } from '@/lib/load-state'
import type { EditorKeymapLayer } from '@singapor/core'
import type {
  LanguageServerDefinitionTarget,
  LanguageServerReferencesResult,
} from '@singapor/lsp-plugin'

export function FileEditorBody({
  active,
  liveDocument,
  definitionTarget,
  editorKeymapLayers,
  fileState,
  languageServerReferences,
  path,
  rootPath,
  tabId,
}: {
  active: boolean
  liveDocument: EditorRenderDocument | null
  definitionTarget: LanguageServerDefinitionTarget | null
  editorKeymapLayers: readonly EditorKeymapLayer[]
  fileState: LoadState<FileResult>
  languageServerReferences: LanguageServerReferencesResult | null
  path: string
  rootPath: string
  tabId: string
}) {
  const actions = useEditorSurfaceActions()
  // Neither a diff nor a compare document is file-backed, so neither can own a live editor
  // document. Both are parsed before the hook below, which has to run above every early exit.
  const diffDocument = parseDiffDocumentId(path)
  const comparePath = parseCompareSavedDocumentId(path)
  const editorDocument = useHeldLiveDocument(
    liveDocument,
    !diffDocument && !comparePath && isSettling(fileState),
  )

  if (diffDocument) {
    return <DiffView documentInfo={diffDocument} rootPath={rootPath} tabId={tabId} />
  }

  if (comparePath) return <CompareSavedView path={comparePath} rootPath={rootPath} tabId={tabId} />

  if (editorDocument) {
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
          document={editorDocument}
          keymapLayers={editorKeymapLayers}
          rootPath={rootPath}
          tabId={tabId}
          onDirtyChange={actions.setDirtyState}
          onScrollPositionChange={(_path, scrollPosition) =>
            actions.setScrollPosition(scrollPosition)
          }
          onStatusSourceChange={actions.setStatusSource}
          onTextChange={actions.recordTextChange}
          onOpenDefinition={actions.openDefinition}
          onOpenReferences={actions.openReferences}
        />
        {languageServerReferences ? (
          <LanguageServerReferencesPane
            references={languageServerReferences}
            rootPath={rootPath}
            onClose={actions.closeReferences}
            onOpenReference={actions.openDefinition}
            onPreviewReference={actions.previewReference}
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

/** A tab with a file on the way keeps the last document; an empty or failed one has nothing to wait for. */
function isSettling(fileState: LoadState<FileResult>): boolean {
  return fileState.status === 'loading' || fileState.status === 'ready'
}
