import type ts from "typescript"
import type * as lsp from "vscode-languageserver-protocol"

/**
 * Open document tracked by the TypeScript LSP session.
 *
 * Mirrors the shape used internally by `session.ts` today; re-homed here so
 * that handler modules (Req 6.1) can reference the same structural type
 * without reaching into the session class.
 */
export type OpenDocument = {
  uri: lsp.DocumentUri
  fileName: string
  languageId: string
  version: number
  text: string
}

/**
 * Shared session state passed to every extracted LSP handler (Req 6.2).
 *
 * Handlers receive a `SessionContext` instead of a reference to the
 * `TypeScriptLspSession` class, which keeps each handler module a pure
 * function of its inputs and avoids circular imports between `session.ts`
 * and `handlers/*`.
 *
 * The shape matches design §"Req 6":
 *
 * - `root` / `workspaceRoot` — normalized absolute paths the session was
 *   constructed with.
 * - `documents` — live document registry keyed by LSP document URI.
 * - `getLanguageService` / `getProjectVersion` — late-bound accessors so
 *   handlers always observe the current language service instance and
 *   project version, even after Req 14 invalidation rebuilds them.
 * - `scheduleDiagnostics` / `clearScheduledDiagnostics` — debounced
 *   diagnostic publish scheduling used by lifecycle handlers.
 * - `bumpScriptVersion` — per-file script-version bookkeeping consumed by
 *   `didOpen` / `didChange` / `didClose` (Req 6.2, Req 14).
 * - `invalidateForFileContentChange` / `invalidateForProjectConfigChange` —
 *   incremental invalidation primitives (Req 14). `*FileContentChange` keeps
 *   the language service alive; `*ProjectConfigChange` disposes and rebuilds.
 * - `postDiagnostics` / `postLogMessage` / `postResponse` / `postResponseError`
 *   — JSON-RPC send helpers. Handlers never touch the underlying transport
 *   directly.
 * - `compilerOptionsOverride` — compiler options supplied via
 *   `initializationOptions`; read-only for handlers.
 * - `applyInitializationOptions` — mutation surface the `initialize` handler
 *   uses to replace the session-scoped compiler-options override and
 *   diagnostic-publish delay in a single call (Req 6.1). Omitted fields
 *   reset to their documented defaults (`{}` for `compilerOptions`,
 *   `DEFAULT_DIAGNOSTIC_DELAY_MS` for `diagnosticDelayMs`). Callers are
 *   expected to follow up with `invalidateForProjectConfigChange()` because
 *   applying new compiler options requires rebuilding the language service
 *   (Req 14.1, Req 14.3).
 */
export type SessionContext = {
  readonly root: string
  readonly workspaceRoot: string
  readonly documents: Map<lsp.DocumentUri, OpenDocument>
  getLanguageService(): ts.LanguageService
  getProjectVersion(): string
  scheduleDiagnostics(uri: lsp.DocumentUri): void
  clearScheduledDiagnostics(uri: lsp.DocumentUri): void
  bumpScriptVersion(fileName: string): void
  invalidateForFileContentChange(fileName: string): void
  invalidateForProjectConfigChange(): void
  postDiagnostics(
    uri: lsp.DocumentUri,
    version: number | null,
    diagnostics: readonly lsp.Diagnostic[],
  ): void
  postLogMessage(error: unknown): void
  postResponse(id: lsp.RequestMessage["id"] | null, result: unknown): void
  postResponseError(id: lsp.RequestMessage["id"] | null, error: unknown): void
  readonly compilerOptionsOverride: ts.CompilerOptions
  applyInitializationOptions(options: {
    compilerOptions?: ts.CompilerOptions
    diagnosticDelayMs?: number
  }): void
}
