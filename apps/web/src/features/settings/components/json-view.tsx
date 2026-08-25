import { useEditorDocumentState } from '@/features/editor/state/document-state'
import { Editor } from '@/features/editor/components/editor'
import type { EditorRenderDocument } from '@/features/editor/utils/render-document'
import type { EditorKeymapLayer } from '@singapor/core'
import type { SettingsDiagnostic, SettingsLayerFile } from '@workspace/contracts'

import { JsonLoading } from '@/features/settings/components/json-loading'
import { RawConflictBanner } from '@/features/settings/components/raw-conflict-banner'
import { useSettingsDiagnosticsPlugin } from '@/features/settings/hooks/use-settings-diagnostics-plugin'
import type { SettingsScope } from '@/features/settings/state/scope-store'
import { settingsJsonDocumentId } from '@/features/settings/utils/json-document'
import { SETTINGS_LANGUAGE_SERVER_TARGET } from '@/features/settings/utils/language-server'

/**
 * The settings document as text, in the same editor everything else opens in.
 *
 * The document is handed down rather than selected here: the tab body already
 * joins the buffer, the view session and the path into one render document, and
 * a second derivation would have to build a fresh object inside a store selector.
 */
export function SettingsJsonView({
  diagnostics,
  editorKeymapLayers,
  file,
  liveDocument,
  rootPath,
  scope,
  tabId,
}: {
  diagnostics: readonly SettingsDiagnostic[]
  editorKeymapLayers: readonly EditorKeymapLayer[]
  file: SettingsLayerFile | null
  liveDocument: EditorRenderDocument | null
  rootPath: string
  scope: SettingsScope
  tabId: string
}) {
  const diagnosticsPlugins = useSettingsDiagnosticsPlugin({ diagnostics, file, target: scope })
  const setLiveEditorDocumentDirty = useEditorDocumentState(
    (state) => state.setLiveEditorDocumentDirty,
  )
  const recordLiveEditorDocumentTextChange = useEditorDocumentState(
    (state) => state.recordLiveEditorDocumentTextChange,
  )

  // The buffer is seeded and bound in effects, so the first render after opening
  // the view — or after a scope switch — still has the previous document or none.
  if (!liveDocument || liveDocument.path !== settingsJsonDocumentId(scope)) {
    return <JsonLoading />
  }

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <RawConflictBanner documentId={settingsJsonDocumentId(scope)} />
      <div className='min-h-0 flex-1'>
        <Editor
          active
          additionalPlugins={diagnosticsPlugins}
          document={liveDocument}
          keymapLayers={editorKeymapLayers}
          languageServerTarget={SETTINGS_LANGUAGE_SERVER_TARGET}
          rootPath={rootPath}
          tabId={tabId}
          onDirtyChange={setLiveEditorDocumentDirty}
          onTextChange={(_tabId, path) => recordLiveEditorDocumentTextChange(path)}
        />
      </div>
    </div>
  )
}
