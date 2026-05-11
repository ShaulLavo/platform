import type {
  EntryTypeFilter as ContractsEntryTypeFilter,
  TreeEntry as ContractsTreeEntry,
  WatchClientMessage as ContractsWatchClientMessage,
  WatchServerMessage as ContractsWatchServerMessage,
  WorkspaceSearchDoneEvent as ContractsWorkspaceSearchDoneEvent,
  WorkspaceSearchEvent as ContractsWorkspaceSearchEvent,
  WorkspaceSearchMatch as ContractsWorkspaceSearchMatch,
} from "@workspace/contracts"
import * as v from "valibot"

export const pathSchema = v.pipe(v.string(), v.maxLength(4096))
export const depthQueryValueSchema = integerQueryValueSchema("1", 10)
export const limitQueryValueSchema = integerQueryValueSchema("50", 200)
export const recentLimitQueryValueSchema = integerQueryValueSchema("20", 50)
export const entryTypeQueryValueSchema = v.union([
  v.literal("file"),
  v.literal("directory"),
  v.literal("symlink"),
  v.literal("other"),
])
export const booleanQueryValueSchema = v.pipe(
  v.union([
    v.literal("true"),
    v.literal("false"),
    v.literal("1"),
    v.literal("0"),
  ]),
  v.transform((value) => value === "true" || value === "1")
)

export const treeEntrySchema = v.object({
  name: v.string(),
  path: pathSchema,
  type: entryTypeQueryValueSchema,
  targetType: v.optional(entryTypeQueryValueSchema),
  size: v.number(),
  mtimeMs: v.number(),
  birthtimeMs: v.number(),
})

export const pathQuerySchema = v.object({
  path: v.optional(pathSchema, ""),
})

export const treeQuerySchema = v.object({
  path: v.optional(pathSchema, ""),
  depth: v.optional(depthQueryValueSchema, "1"),
  entryType: v.optional(entryTypeQueryValueSchema),
})

export const findQuerySchema = v.object({
  path: v.optional(pathSchema, ""),
  query: v.string(),
  limit: v.optional(limitQueryValueSchema, "50"),
  includeContent: v.optional(booleanQueryValueSchema, "false"),
  entryType: v.optional(entryTypeQueryValueSchema),
  maxDepth: v.optional(depthQueryValueSchema),
})

export const workspaceSearchSourceSchema = v.union([
  v.literal("disk"),
  v.literal("open-buffer"),
])

export const workspaceSearchMatchSchema = v.object({
  column: v.optional(v.number()),
  endColumn: v.optional(v.number()),
  kind: v.union([v.literal("name"), v.literal("content")]),
  line: v.optional(v.number()),
  path: pathSchema,
  preview: v.optional(v.string()),
  source: workspaceSearchSourceSchema,
  targetType: v.optional(entryTypeQueryValueSchema),
  type: entryTypeQueryValueSchema,
})

export const workspaceSearchDoneEventSchema = v.object({
  count: v.number(),
  path: pathSchema,
  query: v.string(),
  truncated: v.boolean(),
  type: v.literal("done"),
})

export const workspaceSearchEventSchema = v.variant("type", [
  v.object({
    match: workspaceSearchMatchSchema,
    type: v.literal("match"),
  }),
  workspaceSearchDoneEventSchema,
  v.object({
    code: v.string(),
    message: v.string(),
    type: v.literal("error"),
  }),
])

export const eventsQuerySchema = v.object({
  path: v.optional(pathSchema),
  paths: v.optional(v.union([v.string(), v.array(pathSchema)])),
})

export const recentsQuerySchema = v.object({
  limit: v.optional(recentLimitQueryValueSchema, "20"),
})

export const recordRecentBodySchema = v.object({
  path: pathSchema,
})

export const writeBodySchema = v.object({
  path: pathSchema,
  content: v.string(),
  expectedMtimeMs: v.optional(v.number()),
})

export const createFileBodySchema = v.object({
  path: pathSchema,
  content: v.optional(v.string()),
  overwrite: v.optional(v.boolean()),
})

export const createFolderBodySchema = v.object({
  path: pathSchema,
  recursive: v.optional(v.boolean()),
})

export const renameBodySchema = v.object({
  from: pathSchema,
  to: pathSchema,
  overwrite: v.optional(v.boolean()),
})

export const copyBodySchema = v.object({
  from: pathSchema,
  to: pathSchema,
  overwrite: v.optional(v.boolean()),
  recursive: v.optional(v.boolean()),
})

export const deleteBodySchema = v.object({
  path: pathSchema,
  recursive: v.optional(v.boolean()),
})

export const watchClientMessageSchema = v.variant("type", [
  v.object({
    type: v.literal("subscribe"),
    path: pathSchema,
  }),
  v.object({
    type: v.literal("unsubscribe"),
    path: pathSchema,
  }),
  v.object({
    type: v.literal("ping"),
  }),
])

export const watchServerMessageSchema = v.variant("type", [
  v.object({
    type: v.literal("ready"),
    root: v.string(),
  }),
  v.object({
    type: v.literal("subscribed"),
    path: pathSchema,
  }),
  v.object({
    type: v.literal("unsubscribed"),
    path: pathSchema,
  }),
  v.object({
    type: v.literal("pong"),
  }),
  v.object({
    type: v.literal("created"),
    path: pathSchema,
    entry: v.optional(treeEntrySchema),
  }),
  v.object({
    type: v.literal("changed"),
    path: pathSchema,
    entry: v.optional(treeEntrySchema),
  }),
  v.object({
    type: v.literal("deleted"),
    path: pathSchema,
  }),
  v.object({
    type: v.literal("renamed"),
    path: pathSchema,
    oldPath: pathSchema,
    entry: v.optional(treeEntrySchema),
  }),
  v.object({
    type: v.literal("error"),
    code: v.string(),
    message: v.string(),
  }),
])

export type WriteBody = v.InferOutput<typeof writeBodySchema>
export type CreateFileBody = v.InferOutput<typeof createFileBodySchema>
export type CreateFolderBody = v.InferOutput<typeof createFolderBodySchema>
export type RenameBody = v.InferOutput<typeof renameBodySchema>
export type CopyBody = v.InferOutput<typeof copyBodySchema>
export type DeleteBody = v.InferOutput<typeof deleteBodySchema>
export type RecordRecentBody = v.InferOutput<typeof recordRecentBodySchema>

export type {
  EntryTypeFilter,
  TreeEntry,
  WatchClientMessage,
  WatchServerMessage,
} from "@workspace/contracts"

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false

type Assert<T extends true> = T

export const _assertEntryTypeFilterParity: Assert<
  Equals<
    v.InferOutput<typeof entryTypeQueryValueSchema>,
    ContractsEntryTypeFilter
  >
> = true

export const _assertTreeEntryParity: Assert<
  Equals<v.InferOutput<typeof treeEntrySchema>, ContractsTreeEntry>
> = true

export const _assertWatchClientMessageParity: Assert<
  Equals<
    v.InferOutput<typeof watchClientMessageSchema>,
    ContractsWatchClientMessage
  >
> = true

export const _assertWatchServerMessageParity: Assert<
  Equals<
    v.InferOutput<typeof watchServerMessageSchema>,
    ContractsWatchServerMessage
  >
> = true

export const _assertWorkspaceSearchMatchParity: Assert<
  Equals<
    v.InferOutput<typeof workspaceSearchMatchSchema>,
    ContractsWorkspaceSearchMatch
  >
> = true

export const _assertWorkspaceSearchDoneEventParity: Assert<
  Equals<
    v.InferOutput<typeof workspaceSearchDoneEventSchema>,
    ContractsWorkspaceSearchDoneEvent
  >
> = true

export const _assertWorkspaceSearchEventParity: Assert<
  Equals<
    v.InferOutput<typeof workspaceSearchEventSchema>,
    ContractsWorkspaceSearchEvent
  >
> = true

function integerQueryValueSchema(defaultValue: string, max: number) {
  return v.pipe(
    v.string(),
    v.toNumber(),
    v.integer(),
    v.minValue(1),
    v.toMaxValue(max),
    v.transform((value) => value || Number(defaultValue))
  )
}
