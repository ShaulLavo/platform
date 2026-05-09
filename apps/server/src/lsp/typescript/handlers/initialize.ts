import { isRecord } from "@workspace/contracts"
import ts from "typescript"
import type * as lsp from "vscode-languageserver-protocol"

import type { SessionContext } from "../shared/context"

/**
 * LSP `textDocumentSync.change` value for incremental sync.
 */
const TEXT_DOCUMENT_SYNC_INCREMENTAL = 2

/**
 * Handle an `initialize` request.
 *
 * Parses the client-supplied `initializationOptions`, forwards them to the
 * session via {@link SessionContext.applyInitializationOptions}, and signals a
 * project-configuration change so the next request rebuilds the language
 * service against the new compiler options.
 */
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
        triggerCharacters: [".", '"', "'", "`", "/", "@", "<"],
        resolveProvider: false,
      },
      signatureHelpProvider: {
        triggerCharacters: ["(", ",", "<"],
        retriggerCharacters: [")"],
      },
      referencesProvider: true,
      documentSymbolProvider: true,
      renameProvider: {
        prepareProvider: true,
      },
      codeActionProvider: true,
    },
    serverInfo: {
      name: "platform-typescript-lsp",
      version: ts.version,
    },
  }
}

/**
 * Extract the `{ compilerOptions, diagnosticDelayMs }` payload from an
 * `initialize` params object. Unrecognized or malformed inputs yield an
 * empty record so callers can safely spread the result.
 */
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
      typeof options.diagnosticDelayMs === "number" ? options.diagnosticDelayMs : undefined,
  }
}
