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
import type {
  FileOpenIntentPreparationConfiguration,
  FileOpenIntentPreparationStage,
  FileOpenIntentPreparer,
} from '@/lib/file-open-intent/state/service'

const PREPARED_VISIBLE_RANGE_CHARS = 300_000
const DEFAULT_EDITOR_TAB_SIZE = 4

export type EditorPreparedEnvironment = {
  readonly appliedThemeContentHash: string | null
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
    environmentTag: preparedEnvironmentTag(environment),
    prepare: (buffer, documentId, path, abortSignal) => {
      const preparedDocument = prepareEditorDocument(buffer, documentId, path, environment)
      return {
        buffer,
        preparedDocument,
        ...preparedDocumentConfiguration(preparedDocument, buffer, path, environment, abortSignal),
      }
    },
    reconfigure: (preparedDocument, buffer, _documentId, path, abortSignal) =>
      preparedDocumentConfiguration(preparedDocument, buffer, path, environment, abortSignal),
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
      environment.appliedThemeContentHash,
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
): EditorPreparedDocument {
  const languageId = languageIdForFilePath(path)
  const tags = editorPreparedDocumentTags(path, environment)
  return createEditorPreparedDocument({
    buffer,
    configuredTabSize: DEFAULT_EDITOR_TAB_SIZE,
    tabSizePolicy: 'detect-indentation',
    documentConfigurationTag: tags.documentConfigurationTag,
    documentId,
    languageId,
  })
}

function preparedDocumentConfiguration(
  prepared: EditorPreparedDocument,
  buffer: EditorTextBuffer,
  path: string,
  environment: EditorPreparedEnvironment,
  abortSignal: AbortSignal,
): FileOpenIntentPreparationConfiguration {
  const languageId = languageIdForFilePath(path)
  const source = environment.syntaxHighlightingEnabled
    ? editorSyntaxHighlightingSource(environment.selectedThemeId)
    : 'disabled'
  const tags = editorPreparedDocumentTags(path, environment)
  const highlighter = highlighterPreparationStage(prepared, source, environment, tags, abortSignal)
  const structural = structuralPreparationStage(
    prepared,
    buffer,
    languageId,
    source,
    tags,
    abortSignal,
  )
  return {
    documentConfigurationTag: tags.documentConfigurationTag,
    stages: [highlighter, structural].filter(
      (stage): stage is FileOpenIntentPreparationStage => stage !== null,
    ),
  }
}

function structuralPreparationStage(
  prepared: EditorPreparedDocument,
  buffer: EditorTextBuffer,
  languageId: EditorSyntaxLanguageId | null,
  source: EditorSyntaxHighlightingSource,
  tags: EditorPreparedDocumentTags,
  abortSignal: AbortSignal,
): FileOpenIntentPreparationStage | null {
  if (!languageId || source === 'disabled') return null

  const snapshot = buffer.getSnapshot()
  const provider = editorTreeSitterSyntaxProvider()
  return {
    configurationTag: tags.structuralConfigurationTag,
    family: 'structural',
    provider,
    start: () =>
      prepared.startStage({
        abortSignal,
        configuration: {
          includeCaptures: languageId === 'markdown',
          includeHighlights: source === 'tree-sitter',
          syntaxMode: 'range',
        },
        configurationTag: tags.structuralConfigurationTag,
        family: 'structural',
        provider,
        range: {
          startIndex: 0,
          endIndex: Math.min(snapshot.length, PREPARED_VISIBLE_RANGE_CHARS),
        },
      }),
  }
}

function highlighterPreparationStage(
  prepared: EditorPreparedDocument,
  source: EditorSyntaxHighlightingSource,
  environment: EditorPreparedEnvironment,
  tags: EditorPreparedDocumentTags,
  abortSignal: AbortSignal,
): FileOpenIntentPreparationStage | null {
  if (source !== 'shiki') return null
  if (!environment.appliedThemeId) return null
  if (environment.appliedThemeId !== environment.selectedThemeId) return null

  const provider = editorShikiHighlighterProvider()
  return {
    configurationTag: tags.highlighterConfigurationTag,
    family: 'highlighter',
    provider,
    start: () =>
      prepared.startStage({
        abortSignal,
        configurationTag: tags.highlighterConfigurationTag,
        family: 'highlighter',
        provider,
        range: 'full',
      }),
  }
}

function preparedEnvironmentTag(environment: EditorPreparedEnvironment): string {
  return [
    environment.appliedThemeId ?? '',
    environment.appliedThemeContentHash ?? '',
    environment.selectedThemeId,
    String(environment.syntaxHighlightingEnabled),
  ].join('\u0000')
}
