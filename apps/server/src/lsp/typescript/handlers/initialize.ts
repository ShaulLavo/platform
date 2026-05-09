import { isRecord } from "@workspace/contracts"
import ts from "typescript"
import type * as lsp from "vscode-languageserver-protocol"

import type { SessionContext } from "../shared/context"

/**
 * LSP `textDocumentSync.change` value for incremental sync. Mirrors the
 * literal previously inlined in `session.ts`; declared here so the handler
 * module can advertise its supported sync mode without pulling in the
 * runtime `lsp` namespace value (the project imports it type-only).
 */
const TEXT_DOCUMENT_SYNC_INCREMENTAL = 2

/**
 * Handle an `initialize` request (Req 6.1, Req 6.2).
 *
 * Parses the client-supplied `initializationOptions`, forwards them to the
 * session via {@link SessionContext.applyInitializationOptions}, and signals a
 * project-configuration change so the next request rebuilds the language
 * service against the new compiler options (Req 14.1, Req 14.3).
 *
 * The returned capabilities object exactly matches the previous inline
 * implementation in `session.ts` so clients observe no behavioral drift
 * during the parallel-extraction window (Req 6.4).
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
