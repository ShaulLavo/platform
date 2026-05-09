/**
 * Shared filesystem-entry contract.
 *
 * Mirrors the Valibot `treeEntrySchema` / `entryTypeQueryValueSchema`
 * defined in `apps/server/src/fs/contracts.ts`. The server retains the
 * Valibot schemas as the runtime validation source; this module
 * declares the equivalent pure-TypeScript shapes so the web app and
 * other packages can consume them without pulling in Valibot or the
 * Eden type bridge.
 *
 * The structural equivalence between this type and the server's
 * `v.InferOutput<typeof treeEntrySchema>` is enforced at compile time
 * by parity assertions colocated with the server schema (see task 3.2
 * of the codebase-review-remediation spec).
 *
 * @see Requirements 5.1, 5.2, 5.3, 5.7 of the codebase-review-remediation spec.
 */

/**
 * Filter + discriminator for the filesystem entry kind. Mirrors
 * `entryTypeQueryValueSchema` in `apps/server/src/fs/contracts.ts`.
 */
export type EntryTypeFilter = "file" | "directory" | "symlink" | "other"

/**
 * Canonical directory/file entry returned by the filesystem service.
 * Structurally equivalent to the Valibot `treeEntrySchema` inferred
 * output.
 */
export type TreeEntry = {
  name: string
  path: string
  type: EntryTypeFilter
  size: number
  mtimeMs: number
  birthtimeMs: number
}
