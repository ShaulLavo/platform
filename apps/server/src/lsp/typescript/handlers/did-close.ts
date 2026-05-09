import { isRecord } from "@workspace/contracts"
import type * as lsp from "vscode-languageserver-protocol"

import type { SessionContext } from "../shared/context"

/**
 * Handle a `textDocument/didClose` notification (Req 6.1, Req 6.2).
 *
 * Removes the document from the shared registry, clears any scheduled
 * diagnostic publication so stale diagnostics cannot fire after close, bumps
 * the script version so the language service treats the on-disk copy as the
 * source of truth next time it is queried, and triggers incremental
 * file-content invalidation (Req 14.1, Req 14.4) — closing a document never
 * requires rebuilding the language service.
 *
 * Finally the handler publishes an empty diagnostics list for the closed
 * URI so clients can clear any remaining squiggles (pre-extraction behavior
 * preserved per Req 6.4).
 *
 * Malformed params are ignored silently.
 */
export function handleDidClose(ctx: SessionContext, params: unknown): void {
  const uri = didCloseUri(params)
  if (!uri) return

  const document = ctx.documents.get(uri)
  ctx.documents.delete(uri)
  ctx.clearScheduledDiagnostics(uri)
  if (document) {
    ctx.bumpScriptVersion(document.fileName)
    ctx.invalidateForFileContentChange(document.fileName)
  }
  ctx.postDiagnostics(uri, document?.version ?? null, [])
}

function didCloseUri(params: unknown): lsp.DocumentUri | null {
  const document = textDocumentIdentifier(params)
  return document?.uri ?? null
}

function textDocumentIdentifier(params: unknown): lsp.TextDocumentIdentifier | null {
  if (!isRecord(params)) return null
  if (!isRecord(params.textDocument)) return null
  return typeof params.textDocument.uri === "string"
    ? ({ uri: params.textDocument.uri } satisfies lsp.TextDocumentIdentifier)
    : null
}
