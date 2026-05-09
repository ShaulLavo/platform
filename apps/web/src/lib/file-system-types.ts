/**
 * Web-app filesystem type re-exports.
 *
 * Surfaces the cross-boundary filesystem types from
 * `@workspace/contracts` through the existing
 * `@/lib/file-system-types` import path so the web app has a single
 * well-known barrel for filesystem shapes.
 *
 * `TreeEntry` is the contracts-level entry with a web-local recursive
 * `children` extension: the server emits nested children at
 * `depth > 1` in the `/fs/tree` response even though its Valibot
 * schema — and the contracts-level `TreeEntry` — describes each entry
 * as flat.
 *
 * @see Requirements 5.3, 5.6 of the codebase-review-remediation spec.
 */
import type { TreeEntry as ContractsTreeEntry } from "@workspace/contracts"

export type {
  EntryTypeFilter as FsEntryType,
  FileResult,
} from "@workspace/contracts"

export type TreeEntry = ContractsTreeEntry & {
  children?: TreeEntry[]
}

export type TreeResult = {
  path: string
  entries: TreeEntry[]
}
