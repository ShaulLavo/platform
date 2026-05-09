// Barrel module for `apps/server/src/fs/`.
//
// `contracts.ts` re-exports `TreeEntry` from `@workspace/contracts` and
// `tree.ts` exports a server-local recursive `TreeEntry` with a
// `children?` extension used at `depth > 1`. Both cannot flow through
// a single `export *` without becoming ambiguous, so `TreeEntry` is
// forwarded from `./tree` (the superset) at the barrel level and the
// rest of `./contracts` is re-exported explicitly. Consumers that want
// the flat contracts-level shape should import it from
// `@workspace/contracts` directly.
export type {
	CopyBody,
	CreateFileBody,
	CreateFolderBody,
	DeleteBody,
	EntryTypeFilter,
	RecordRecentBody,
	RenameBody,
	WatchClientMessage,
	WatchServerMessage,
	WriteBody,
} from './contracts'
export {
	booleanQueryValueSchema,
	copyBodySchema,
	createFileBodySchema,
	createFolderBodySchema,
	deleteBodySchema,
	depthQueryValueSchema,
	entryTypeQueryValueSchema,
	eventsQuerySchema,
	findQuerySchema,
	limitQueryValueSchema,
	pathQuerySchema,
	pathSchema,
	recentLimitQueryValueSchema,
	recentsQuerySchema,
	recordRecentBodySchema,
	renameBodySchema,
	treeEntrySchema,
	treeQuerySchema,
	watchClientMessageSchema,
	watchServerMessageSchema,
	writeBodySchema,
} from './contracts'
export * from './errors'
export * from './path'
export * from './service'
export * from './stat'
export * from './tree'
export * from './read'
export * from './search'
export * from './metadata'
