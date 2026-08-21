import { useEditorDocumentState } from '@/features/editor/state/document-state'
import { Editor } from '@/features/editor/components/editor'
import type { EditorRenderDocument } from '@/features/editor/utils/render-document'
import type { EditorKeymapLayer } from '@singapor/core'

import { settingsJsonDocumentId } from '../utils/json-document'
import type { SettingsScope } from '../state/scope-store'
import { Status } from './status'

/**
 * The settings document as text, in the same editor everything else opens in.
 *
 * The document is handed down rather than selected here: the tab body already
 * joins the buffer, the view session and the path into one render document, and
 * a second derivation would have to build a fresh object inside a store selector.
 */
export function SettingsJsonView({
  editorKeymapLayers,
  liveDocument,
  rootPath,
  scope,
  tabId,
}: {
  editorKeymapLayers: readonly EditorKeymapLayer[]
  liveDocument: EditorRenderDocument | null
  rootPath: string
  scope: SettingsScope
  tabId: string
}) {
  const setLiveEditorDocumentDirty = useEditorDocumentState(
    (state) => state.setLiveEditorDocumentDirty,
  )
  const recordLiveEditorDocumentTextChange = useEditorDocumentState(
    (state) => state.recordLiveEditorDocumentTextChange,
  )

  // The buffer is seeded and bound in effects, so the first render after opening
  // the view — or after a scope switch — still has the previous document or none.
  if (!liveDocument || liveDocument.path !== settingsJsonDocumentId(scope)) {
    return <Status>Loading settings.json…</Status>
  }

  return (
    <Editor
      active
      document={liveDocument}
      keymapLayers={editorKeymapLayers}
      rootPath={rootPath}
      tabId={tabId}
      onDirtyChange={setLiveEditorDocumentDirty}
      onTextChange={(_tabId, path) => recordLiveEditorDocumentTextChange(path)}
    />
  )
}
