import type ts from "typescript"
import type * as lsp from "vscode-languageserver-protocol"

export type OpenDocument = {
  uri: lsp.DocumentUri
  fileName: string
  languageId: string
  version: number
  text: string
}

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
    diagnostics: readonly lsp.Diagnostic[]
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
