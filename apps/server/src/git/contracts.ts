import * as v from "valibot"
import { booleanQueryValueSchema, pathSchema } from "../fs/contracts"

export const gitPathQuerySchema = v.object({
  path: v.optional(pathSchema, ""),
})

export const gitDiffQuerySchema = v.object({
  path: v.optional(pathSchema, ""),
  staged: v.optional(booleanQueryValueSchema, "false"),
})

export const gitFileQuerySchema = v.object({
  path: pathSchema,
  ref: v.optional(v.string(), "HEAD"),
})

export const gitPathsBodySchema = v.object({
  path: v.optional(pathSchema),
  paths: v.optional(v.array(pathSchema)),
})

export const gitApplyPatchBodySchema = v.object({
  path: v.optional(pathSchema, ""),
  patch: v.string(),
  reverse: v.optional(v.boolean(), false),
  target: v.optional(v.picklist(["index", "worktree"]), "worktree"),
})

export const gitCommitBodySchema = v.object({
  path: v.optional(pathSchema, ""),
  message: v.pipe(v.string(), v.trim(), v.minLength(1)),
})

export const gitCheckoutBodySchema = v.object({
  path: v.optional(pathSchema, ""),
  branch: v.pipe(v.string(), v.trim(), v.minLength(1)),
})

export const gitCreateBranchBodySchema = v.object({
  path: v.optional(pathSchema, ""),
  branch: v.pipe(v.string(), v.trim(), v.minLength(1)),
  checkout: v.optional(v.boolean(), true),
  startPoint: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
})

export type GitPathQuery = v.InferOutput<typeof gitPathQuerySchema>
export type GitDiffQuery = v.InferOutput<typeof gitDiffQuerySchema>
export type GitFileQuery = v.InferOutput<typeof gitFileQuerySchema>
export type GitPathsBody = v.InferOutput<typeof gitPathsBodySchema>
export type GitApplyPatchBody = v.InferOutput<typeof gitApplyPatchBodySchema>
export type GitCommitBody = v.InferOutput<typeof gitCommitBodySchema>
export type GitCheckoutBody = v.InferOutput<typeof gitCheckoutBodySchema>
export type GitCreateBranchBody = v.InferOutput<
  typeof gitCreateBranchBodySchema
>
