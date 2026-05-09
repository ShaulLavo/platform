/**
 * Shared text-file read result contract.
 *
 * Mirrors the `ReadFileResult` type exported from
 * `apps/server/src/fs/read.ts`. The server is the single source of
 * truth for the runtime shape; this module declares the equivalent
 * pure-TypeScript type so the web app can depend on it without
 * inferring it through the Eden bridge.
 *
 * @see Requirements 5.1, 5.2, 5.3, 5.7 of the codebase-review-remediation spec.
 */
export type FileResult = {
  path: string
  content: string
  mtimeMs: number
  size: number
}
