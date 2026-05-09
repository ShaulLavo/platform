// Barrel for @workspace/contracts.
//
// Cross-boundary shared types (`TreeEntry`, `EntryTypeFilter`,
// `FileResult`, `WatchServerMessage`, `WatchClientMessage`,
// `ErrorCategory`) plus the canonical `isRecord` utility. These are
// the pure-TypeScript mirrors of the server-owned Valibot schemas;
// the server retains the schemas as the runtime validation source
// and structural-equivalence is enforced at compile time by parity
// assertions colocated with the schemas.
export type { EntryTypeFilter, TreeEntry } from "./tree-entry"
export type { FileResult } from "./file-result"
export type { WatchClientMessage, WatchServerMessage } from "./watch-events"
export type { ErrorCategory } from "./error-category"
export { isRecord } from "./is-record"
