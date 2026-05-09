import path from "node:path"

import type ts from "typescript"
import type * as lsp from "vscode-languageserver-protocol"

import { bumpScriptVersion, type ScriptVersionRegistry } from "./script-versions"

/**
 * Classification returned by `classifyInvalidation` (Req 14.1).
 *
 * - `"file-content-change"` — a source file text edit, creation, or deletion.
 *   Keeps the current language service instance alive.
 * - `"project-config-change"` — a mutation to a `tsconfig*.json`,
 *   `jsconfig*.json`, or `package.json` that affects the project graph.
 *   Disposes the current service so the next `getLanguageService()` call
 *   rebuilds it against the updated configuration.
 */
export type InvalidationKind = "file-content-change" | "project-config-change"

/**
 * Minimal state surface the invalidation helpers need (Req 14).
 *
 * Modeled as an accessor API rather than a plain record so the session can
 * own the actual fields (`projectVersion`, `service`) and expose just the
 * mutations these helpers require. Keeping the shape this small also makes
 * the helpers trivial to unit-test with a fake state.
 */
export type InvalidationState = {
  /**
   * Increment the counter exposed via `getProjectVersion()` by exactly one.
   * Every invalidation kind bumps the version (Req 14.2, Req 14.3).
   */
  bumpProjectVersion(): void

  /**
   * Per-file script-version registry from `script-versions.ts` (task 5.9).
   * File-content invalidation bumps the entry for the changed file so the
   * language service host treats the next `getScriptSnapshot` as stale.
   */
  readonly scriptVersions: ScriptVersionRegistry

  /**
   * Current language service instance, or `null` if one has not been
   * constructed yet (or was just disposed).
   */
  getLanguageService(): ts.LanguageService | null

  /**
   * Replace the stored language service reference. Passing `null` signals
   * that the next `getLanguageService()` call must rebuild (Req 14.3).
   */
  setLanguageService(service: ts.LanguageService | null): void
}

/**
 * Handle a file-content change — source file edit, creation, or deletion
 * (Req 14.1, Req 14.2, Req 14.4).
 *
 * Bumps `projectVersion` so the language service host recomputes, bumps the
 * per-file script version so the snapshot cache invalidates for `fileName`,
 * and deliberately leaves the language service instance alone. Keeping the
 * service alive across file-content changes is the whole point of Req 14.1.
 */
export function invalidateForFileContentChange(state: InvalidationState, fileName: string): void {
  state.bumpProjectVersion()
  bumpScriptVersion(state.scriptVersions, fileName)
  // Language service instance intentionally retained (Req 14.2, Req 14.4).
}

/**
 * Handle a project configuration change — any mutation to a `tsconfig*.json`,
 * `jsconfig*.json`, or `package.json` that affects the project graph, or
 * receipt of new `compilerOptions` via `initialize` /
 * `workspace/didChangeConfiguration` (Req 14.1, Req 14.3).
 *
 * Bumps `projectVersion`, disposes the current service (if any), and nulls
 * the stored reference so the next `getLanguageService()` call constructs a
 * fresh service against the updated configuration.
 */
export function invalidateForProjectConfigChange(state: InvalidationState): void {
  state.bumpProjectVersion()
  const current = state.getLanguageService()
  current?.dispose()
  state.setLanguageService(null)
}

/**
 * Decide whether `uri` represents a project configuration file or a regular
 * source file, per the design's decision table (Req 14.1, Req 14.4).
 *
 * Project-config patterns (all case-insensitive on basename):
 *   - `tsconfig.json`
 *   - `tsconfig.<name>.json`
 *   - `jsconfig.json`
 *   - `jsconfig.<name>.json`
 *   - `package.json`
 *
 * Everything else — including any other `*.json` file — is treated as a
 * file-content change. Unparseable URIs default to `"file-content-change"`
 * because the caller has no better signal and must fall back to the cheaper,
 * non-disposing path.
 */
export function classifyInvalidation(uri: lsp.DocumentUri): InvalidationKind {
  const basename = basenameForUri(uri)
  if (basename === null) return "file-content-change"
  return isProjectConfigBasename(basename) ? "project-config-change" : "file-content-change"
}

function basenameForUri(uri: lsp.DocumentUri): string | null {
  try {
    const url = new URL(uri)
    const pathname = decodeURIComponent(url.pathname)
    const basename = path.posix.basename(pathname)
    return basename === "" ? null : basename
  } catch {
    return null
  }
}

function isProjectConfigBasename(basename: string): boolean {
  const lower = basename.toLowerCase()
  if (lower === "package.json") return true
  if (lower === "tsconfig.json" || lower === "jsconfig.json") return true
  return /^(?:ts|js)config\.[^/\\]+\.json$/.test(lower)
}
