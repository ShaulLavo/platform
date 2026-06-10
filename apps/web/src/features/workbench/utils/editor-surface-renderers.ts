import { ChatSurface } from '@/features/workbench/components/chat-surface'
import { DiagnosticsSurface } from '@/features/workbench/components/diagnostics-surface'
import { createSurfaceRendererRegistry } from '@/features/workbench/utils/surface-renderer-registry'
import { DiffEditorSurface } from '@/features/workbench/components/diff-editor-surface'
import { EmptyEditorSurface } from '@/features/workbench/components/empty-editor-surface'
import { FileEditorSurface } from '@/features/workbench/components/file-editor-surface'
import { FileNavigatorSurface } from '@/features/workbench/components/file-navigator-surface'
import { GitChangesSurface } from '@/features/workbench/components/git-changes-surface'
import { LogsSurface } from '@/features/workbench/components/logs-surface'
import { SearchResultsSurface } from '@/features/workbench/components/search-results-surface'
import { SearchPreviewSurface } from '@/features/workbench/components/search-preview-surface'
import { TerminalSurface } from '@/features/workbench/components/terminal-surface'

export const editorSurfaceRendererRegistry = createSurfaceRendererRegistry([
  {
    renderer: ChatSurface,
    type: 'chat',
  },
  {
    renderer: DiagnosticsSurface,
    type: 'diagnostics',
  },
  {
    renderer: DiffEditorSurface,
    type: 'diff',
  },
  {
    renderer: FileEditorSurface,
    type: 'file-editor',
  },
  {
    renderer: FileNavigatorSurface,
    type: 'file-navigator',
  },
  {
    renderer: GitChangesSurface,
    type: 'git-changes',
  },
  {
    renderer: LogsSurface,
    type: 'logs',
  },
  {
    renderer: EmptyEditorSurface,
    type: 'placeholder',
  },
  {
    renderer: SearchResultsSurface,
    type: 'search-results',
  },
  {
    renderer: SearchPreviewSurface,
    type: 'search-preview',
  },
  {
    renderer: TerminalSurface,
    type: 'terminal',
  },
])
