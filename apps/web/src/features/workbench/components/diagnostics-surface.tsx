import type {
  LanguageServerDefinitionTarget,
  LanguageServerDiagnosticSummary,
  LanguageServerStatus,
} from '@editor/lsp-plugin'

import { useEditorLanguageServerStatus } from '@/features/editor/hooks/use-editor-language-server-status'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import type { EditorStatusBarSource } from '@/features/editor/state/editor-status-bar-source'
import { useEditorUiState, useEditorUiStoreApi } from '@/features/editor/state/editor-ui-state'
import { PanelUnavailable } from '@/features/workbench/components/panel-unavailable'
import { useLayoutStoreApi } from '@/features/workbench/hooks/use-layout-store-api'
import { openTransientFilePreview } from '@/features/workbench/utils/transient-file-preview'
import type { SurfaceRendererProps } from '@/features/workbench/utils/surface-renderer-registry'

export function DiagnosticsSurface({ surface }: SurfaceRendererProps) {
  const statusBarSource = useEditorUiState((state) => state.statusBarSource)
  const commands = useEditorCommands()
  const layoutStore = useLayoutStoreApi()
  const uiStore = useEditorUiStoreApi()
  if (surface.type !== 'diagnostics') {
    return <PanelUnavailable message='This surface is not diagnostics.' />
  }

  function previewDiagnostic(target: LanguageServerDefinitionTarget) {
    openTransientFilePreview({ layoutStore, ownerSurfaceId: surface.id, target, uiStore })
  }

  return (
    <section className='bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
      <header className='flex h-10 shrink-0 items-center gap-2 border-b px-3'>
        <div className='truncate text-xs font-medium'>Problems</div>
      </header>
      {statusBarSource ? (
        <DiagnosticsStatus
          source={statusBarSource}
          onOpenDiagnostic={commands.openDefinition}
          onPreviewDiagnostic={previewDiagnostic}
        />
      ) : (
        <DiagnosticsEmpty message='No active editor diagnostics' />
      )}
    </section>
  )
}

function DiagnosticsStatus({
  source,
  onOpenDiagnostic,
  onPreviewDiagnostic,
}: {
  readonly source: EditorStatusBarSource
  onOpenDiagnostic(target: LanguageServerDefinitionTarget): void | boolean
  onPreviewDiagnostic(target: LanguageServerDefinitionTarget): void
}) {
  const { diagnostics, status } = useEditorLanguageServerStatus(source.languageServerStatusSource)
  if (!diagnostics || diagnostics.counts.total === 0) {
    return <DiagnosticsEmpty message={emptyDiagnosticsMessage(status)} />
  }

  return (
    <div className='min-h-0 flex-1 overflow-auto p-3 text-xs'>
      <div className='text-muted-foreground mb-3 truncate'>{source.filePath}</div>
      <div className='grid grid-cols-4 gap-2'>
        <DiagnosticCount label='Errors' value={diagnostics.counts.error} />
        <DiagnosticCount label='Warnings' value={diagnostics.counts.warning} />
        <DiagnosticCount label='Info' value={diagnostics.counts.information} />
        <DiagnosticCount label='Hints' value={diagnostics.counts.hint} />
      </div>
      <DiagnosticList
        diagnostics={diagnostics}
        path={source.filePath}
        onOpenDiagnostic={onOpenDiagnostic}
        onPreviewDiagnostic={onPreviewDiagnostic}
      />
    </div>
  )
}

function DiagnosticCount({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className='rounded border px-2 py-1'>
      <div className='text-muted-foreground'>{label}</div>
      <div className='text-foreground font-medium tabular-nums'>{value}</div>
    </div>
  )
}

function DiagnosticList({
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
              <div className='text-foreground'>{diagnostic.message}</div>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function DiagnosticsEmpty({ message }: { readonly message: string }) {
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
  return `${diagnostic.message}:${index}`
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
