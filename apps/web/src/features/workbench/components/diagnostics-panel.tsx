import type {
  LanguageServerDefinitionTarget,
  LanguageServerDiagnosticSummary,
  LanguageServerStatus,
} from '@singapor/lsp-plugin'

import { useEditorLanguageServerStatus } from '@/features/editor/hooks/use-editor-language-server-status'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { createEditorLanguageServerStatusSource } from '@/features/editor/state/editor-language-server-status-source'
import type { EditorStatusBarSource } from '@/features/editor/state/editor-status-bar-source'
import { useEditorUiState, useEditorUiStoreApi } from '@/features/editor/state/editor-ui-state'

const idleLanguageServerStatusSource = createEditorLanguageServerStatusSource()

export function DiagnosticsPanel() {
  const statusBarSource = useEditorUiState((state) => state.statusBarSource)
  const commands = useEditorCommands()
  const uiStore = useEditorUiStoreApi()
  const languageServerStatus = useEditorLanguageServerStatus(
    statusBarSource?.languageServerStatusSource ?? idleLanguageServerStatusSource,
  )

  function previewDiagnostic(target: LanguageServerDefinitionTarget) {
    uiStore.getState().setDefinitionTarget(target)
  }

  return (
    <section className='flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
      {statusBarSource
        ? renderDiagnosticsStatus({
            languageServerStatus,
            onOpenDiagnostic: commands.openDefinition,
            onPreviewDiagnostic: previewDiagnostic,
            source: statusBarSource,
          })
        : renderDiagnosticsEmpty('No active editor diagnostics')}
    </section>
  )
}

function renderDiagnosticsStatus({
  languageServerStatus,
  source,
  onOpenDiagnostic,
  onPreviewDiagnostic,
}: {
  readonly languageServerStatus: ReturnType<typeof useEditorLanguageServerStatus>
  readonly source: EditorStatusBarSource
  onOpenDiagnostic(target: LanguageServerDefinitionTarget): void | boolean
  onPreviewDiagnostic(target: LanguageServerDefinitionTarget): void
}) {
  const { diagnostics, status } = languageServerStatus
  if (!diagnostics || diagnostics.counts.total === 0) {
    return renderDiagnosticsEmpty(emptyDiagnosticsMessage(status))
  }

  return (
    <div className='min-h-0 flex-1 overflow-auto p-3 text-xs'>
      <div className='text-muted-foreground mb-3 truncate'>{source.filePath}</div>
      <div className='grid grid-cols-4 gap-2'>
        {renderDiagnosticCount('Errors', diagnostics.counts.error)}
        {renderDiagnosticCount('Warnings', diagnostics.counts.warning)}
        {renderDiagnosticCount('Info', diagnostics.counts.information)}
        {renderDiagnosticCount('Hints', diagnostics.counts.hint)}
      </div>
      {renderDiagnosticList({
        diagnostics,
        onOpenDiagnostic,
        onPreviewDiagnostic,
        path: source.filePath,
      })}
    </div>
  )
}

function renderDiagnosticCount(label: string, value: number) {
  return (
    <div className='rounded border px-2 py-1' key={label}>
      <div className='text-muted-foreground'>{label}</div>
      <div className='text-foreground font-medium tabular-nums'>{value}</div>
    </div>
  )
}

function renderDiagnosticList({
  diagnostics,
  path,
  onOpenDiagnostic,
  onPreviewDiagnostic,
}: {
  readonly diagnostics: LanguageServerDiagnosticSummary
  readonly path: string
  onOpenDiagnostic(target: LanguageServerDefinitionTarget): void | boolean
  onPreviewDiagnostic(target: LanguageServerDefinitionTarget): void
}) {
  if (diagnostics.diagnostics.length === 0) return null

  return (
    <ol className='mt-3 space-y-2'>
      {diagnostics.diagnostics.map((diagnostic, index) => {
        const target = diagnosticTarget(path, diagnostics.uri ?? fileUriForPath(path), diagnostic)

        return (
          <li className='rounded border' key={diagnosticKey(diagnostic, index)}>
            <button
              className='hover:bg-muted/55 focus-visible:ring-ring/50 block w-full rounded px-2 py-2 text-left outline-none focus-visible:ring-1'
              type='button'
              onClick={() => onOpenDiagnostic(target)}
              onFocus={() => onPreviewDiagnostic(target)}
              onMouseEnter={() => onPreviewDiagnostic(target)}
            >
              <div className='text-muted-foreground text-[11px]'>
                {diagnosticSeverityLabel(diagnostic.severity)}
              </div>
              <div className='text-foreground'>{diagnosticMessageText(diagnostic.message)}</div>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function renderDiagnosticsEmpty(message: string) {
  return (
    <div className='text-muted-foreground grid min-h-0 flex-1 place-items-center p-4 text-xs'>
      {message}
    </div>
  )
}

function emptyDiagnosticsMessage(status: LanguageServerStatus) {
  if (status === 'loading') return 'Diagnostics loading'
  if (status === 'error') return 'Diagnostics unavailable'

  return 'No problems reported'
}

function diagnosticSeverityLabel(severity: number | undefined) {
  if (severity === 1) return 'Error'
  if (severity === 2) return 'Warning'
  if (severity === 3) return 'Information'
  if (severity === 4) return 'Hint'

  return 'Diagnostic'
}

function diagnosticKey(
  diagnostic: LanguageServerDiagnosticSummary['diagnostics'][number],
  index: number,
) {
  return `${diagnosticMessageText(diagnostic.message)}:${index}`
}

function diagnosticMessageText(
  message: LanguageServerDiagnosticSummary['diagnostics'][number]['message'],
) {
  if (typeof message === 'string') return message

  return message.value
}

function diagnosticTarget(
  path: string,
  uri: string,
  diagnostic: LanguageServerDiagnosticSummary['diagnostics'][number],
): LanguageServerDefinitionTarget {
  return {
    path,
    range: diagnostic.range,
    uri,
  }
}

function fileUriForPath(path: string) {
  const normalized = path.replace(/^\/+/, '')

  return `file:///${normalized.split('/').map(encodeURIComponent).join('/')}`
}
