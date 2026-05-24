import { isRecord } from '@workspace/contracts'
import ts from 'typescript'
import type * as lsp from 'vscode-languageserver-protocol'

import type { SessionContext } from '../shared/context'

const TEXT_DOCUMENT_SYNC_INCREMENTAL = 2

export function handleInitialize(ctx: SessionContext, params: unknown): lsp.InitializeResult {
  const options = initializationOptions(params)
  ctx.applyInitializationOptions(options)
  ctx.invalidateForProjectConfigChange()

  return {
    capabilities: {
      textDocumentSync: {
        openClose: true,
        change: TEXT_DOCUMENT_SYNC_INCREMENTAL,
      },
      diagnosticProvider: {
        interFileDependencies: true,
        workspaceDiagnostics: false,
      },
      hoverProvider: true,
      definitionProvider: true,
      completionProvider: {
        triggerCharacters: ['.', '"', "'", '`', '/', '@', '<'],
        resolveProvider: false,
      },
      signatureHelpProvider: {
        triggerCharacters: ['(', ',', '<'],
        retriggerCharacters: [')'],
      },
      referencesProvider: true,
      documentSymbolProvider: true,
      renameProvider: {
        prepareProvider: true,
      },
      codeActionProvider: true,
    },
    serverInfo: {
      name: 'platform-typescript-lsp',
      version: ts.version,
    },
  }
}

function initializationOptions(params: unknown): {
  compilerOptions?: ts.CompilerOptions
  diagnosticDelayMs?: number
} {
  if (!isRecord(params)) return {}
  if (!isRecord(params.initializationOptions)) return {}

  const options = params.initializationOptions
  return {
    compilerOptions: isRecord(options.compilerOptions)
      ? (options.compilerOptions as ts.CompilerOptions)
      : undefined,
    diagnosticDelayMs:
      typeof options.diagnosticDelayMs === 'number' ? options.diagnosticDelayMs : undefined,
  }
}
