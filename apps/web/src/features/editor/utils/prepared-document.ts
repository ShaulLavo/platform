import {
  createEditorPreparedDocument,
  type EditorPreparedDocument,
  type EditorPreparedTagValue,
  type EditorSyntaxLanguageId,
  type EditorTextBuffer,
} from '@singapor/core'

import { languageIdForFilePath } from '@/features/editor/utils/file-path'
import {
  editorShikiHighlighterProvider,
  editorSyntaxHighlightingSource,
  editorTreeSitterSyntaxProvider,
  type EditorSyntaxHighlightingSource,
} from '@/features/editor/state/syntax-highlighting'
import type { FileOpenIntentPreparer } from '@/lib/file-open-intent/state/service'

const PREPARED_VISIBLE_RANGE_CHARS = 300_000
const DEFAULT_EDITOR_TAB_SIZE = 4

export type EditorPreparedEnvironment = {
  readonly appliedThemeId: string | null
  readonly selectedThemeId: string
  readonly syntaxHighlightingEnabled: boolean
}

export type EditorPreparedDocumentTags = {
  readonly documentConfigurationTag: readonly EditorPreparedTagValue[]
  readonly highlighterConfigurationTag: readonly EditorPreparedTagValue[]
  readonly structuralConfigurationTag: readonly EditorPreparedTagValue[]
}

export function createPlatformFileOpenPreparer(
  environment: EditorPreparedEnvironment,
): FileOpenIntentPreparer {
  return {
    prepare: (buffer, documentId, path, abortSignal) => {
      const preparation = prepareEditorDocument(buffer, documentId, path, environment, abortSignal)
      return { buffer, ...preparation }
    },
  }
}

export function editorPreparedDocumentTags(
  path: string,
  environment: EditorPreparedEnvironment,
): EditorPreparedDocumentTags {
  const languageId = languageIdForFilePath(path)
  const source = environment.syntaxHighlightingEnabled
    ? editorSyntaxHighlightingSource(environment.selectedThemeId)
    : 'disabled'
  const captures = languageId === 'markdown'
  return {
    documentConfigurationTag: ['platform-editor', languageId, source],
    highlighterConfigurationTag: [
      'platform-shiki',
      source,
      environment.appliedThemeId,
      environment.selectedThemeId,
    ],
    structuralConfigurationTag: ['platform-tree-sitter', source, captures],
  }
}

function prepareEditorDocument(
  buffer: EditorTextBuffer,
  documentId: string,
  path: string,
  environment: EditorPreparedEnvironment,
  abortSignal: AbortSignal,
): {
  readonly preparedDocument: EditorPreparedDocument
  readonly startStages: readonly (() => Promise<unknown> | null)[]
} {
  const languageId = languageIdForFilePath(path)
  const source = environment.syntaxHighlightingEnabled
    ? editorSyntaxHighlightingSource(environment.selectedThemeId)
    : 'disabled'
  const tags = editorPreparedDocumentTags(path, environment)
  const prepared = createEditorPreparedDocument({
    buffer,
    configuredTabSize: DEFAULT_EDITOR_TAB_SIZE,
    documentConfigurationTag: tags.documentConfigurationTag,
    documentId,
    languageId,
  })
  return {
    preparedDocument: prepared,
    startStages: preparedStageStarters(
      prepared,
      buffer,
      languageId,
      source,
      environment,
      tags,
      abortSignal,
    ),
  }
}

function preparedStageStarters(
  prepared: EditorPreparedDocument,
  buffer: EditorTextBuffer,
  languageId: EditorSyntaxLanguageId | null,
  source: EditorSyntaxHighlightingSource,
  environment: EditorPreparedEnvironment,
  tags: EditorPreparedDocumentTags,
  abortSignal: AbortSignal,
): readonly (() => Promise<unknown> | null)[] {
  const startHighlighter = highlighterPreparationStarter(
    prepared,
    source,
    environment,
    tags,
    abortSignal,
  )
  const startStructural = structuralPreparationStarter(
    prepared,
    buffer,
    languageId,
    source,
    tags,
    abortSignal,
  )
  return [startHighlighter, startStructural].filter(
    (start): start is () => Promise<unknown> | null => start !== null,
  )
}

function structuralPreparationStarter(
  prepared: EditorPreparedDocument,
  buffer: EditorTextBuffer,
  languageId: EditorSyntaxLanguageId | null,
  source: EditorSyntaxHighlightingSource,
  tags: EditorPreparedDocumentTags,
  abortSignal: AbortSignal,
): (() => Promise<unknown> | null) | null {
  if (!languageId || source === 'disabled') return null

  const snapshot = buffer.getSnapshot()
  return () =>
    prepared.startStage({
      abortSignal,
      configuration: {
        includeCaptures: languageId === 'markdown',
        includeHighlights: source === 'tree-sitter',
        syntaxMode: 'range',
      },
      configurationTag: tags.structuralConfigurationTag,
      family: 'structural',
      provider: editorTreeSitterSyntaxProvider(),
      range: {
        startIndex: 0,
        endIndex: Math.min(snapshot.length, PREPARED_VISIBLE_RANGE_CHARS),
      },
    })
}

function highlighterPreparationStarter(
  prepared: EditorPreparedDocument,
  source: EditorSyntaxHighlightingSource,
  environment: EditorPreparedEnvironment,
  tags: EditorPreparedDocumentTags,
  abortSignal: AbortSignal,
): (() => Promise<unknown> | null) | null {
  if (source !== 'shiki') return null
  if (!environment.appliedThemeId) return null
  if (environment.appliedThemeId !== environment.selectedThemeId) return null

  return () =>
    prepared.startStage({
      abortSignal,
      configurationTag: tags.highlighterConfigurationTag,
      family: 'highlighter',
      provider: editorShikiHighlighterProvider(),
      range: 'full',
    })
}
