import * as v from 'valibot'
import { booleanQueryValueSchema, pathSchema } from '../fs/contracts'

export const gitPathQuerySchema = v.object({
  path: v.optional(pathSchema, ''),
})

export const gitPathBodySchema = v.object({
  path: v.optional(pathSchema, ''),
})

export const gitDiffQuerySchema = v.object({
  path: v.optional(pathSchema, ''),
  staged: v.optional(booleanQueryValueSchema, 'false'),
})

const gitObjectIdSchema = v.pipe(v.string(), v.regex(/^[0-9a-f]{40,64}$/i))

export const gitBlobDiffQuerySchema = v.object({
  path: pathSchema,
  oldPath: v.optional(pathSchema),
  oldObjectId: v.optional(gitObjectIdSchema),
  newObjectId: v.optional(gitObjectIdSchema),
})

export const gitFileQuerySchema = v.object({
  path: pathSchema,
  ref: v.optional(v.string(), 'HEAD'),
})

export const gitPathsBodySchema = v.object({
  paths: v.array(pathSchema),
})

export const gitApplyPatchBodySchema = v.object({
  path: v.optional(pathSchema, ''),
  patch: v.string(),
  reverse: v.optional(v.boolean(), false),
  target: v.optional(v.picklist(['index', 'worktree']), 'worktree'),
})

export const gitCommitBodySchema = v.object({
  path: v.optional(pathSchema, ''),
  message: v.string(),
})

export const gitCheckoutBodySchema = v.object({
  path: v.optional(pathSchema, ''),
  branch: v.pipe(v.string(), v.trim(), v.minLength(1)),
})

export const gitCreateBranchBodySchema = v.object({
  path: v.optional(pathSchema, ''),
  branch: v.pipe(v.string(), v.trim(), v.minLength(1)),
  checkout: v.optional(v.boolean(), true),
  startPoint: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
})

/**
 * Refs reach git as argv, so a leading dash would be read as a flag and a space
 * would split into two arguments. The allowed shape is git's own ref grammar
 * narrowed to what a base or branch name ever needs.
 */
const gitRefNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(255),
  v.regex(/^[A-Za-z0-9_][A-Za-z0-9._/-]*$/),
)

/**
 * A session id becomes a directory name under the repository's worktree root,
 * so separators and dot segments are rejected outright rather than normalized.
 */
const gitSessionIdSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(128),
  v.regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  v.check((value) => !value.includes('..'), 'Session id must not contain "..".'),
)

export const gitWorktreeCreateBodySchema = v.object({
  path: v.optional(pathSchema, ''),
  sessionId: gitSessionIdSchema,
  base: v.optional(gitRefNameSchema),
  branch: v.optional(gitRefNameSchema),
})

export const gitWorktreeRemoveBodySchema = v.object({
  path: v.optional(pathSchema, ''),
  worktreePath: pathSchema,
  force: v.optional(v.boolean(), false),
})

export const gitBranchDiffQuerySchema = v.object({
  path: v.optional(pathSchema, ''),
  base: v.optional(gitRefNameSchema),
})

export type GitBlobDiffQuery = v.InferOutput<typeof gitBlobDiffQuerySchema>
export type GitPathsBody = v.InferOutput<typeof gitPathsBodySchema>
export type GitApplyPatchBody = v.InferOutput<typeof gitApplyPatchBodySchema>
export type GitCommitBody = v.InferOutput<typeof gitCommitBodySchema>
export type GitCheckoutBody = v.InferOutput<typeof gitCheckoutBodySchema>
export type GitCreateBranchBody = v.InferOutput<typeof gitCreateBranchBodySchema>
export type GitWorktreeCreateBody = v.InferOutput<typeof gitWorktreeCreateBodySchema>
export type GitWorktreeRemoveBody = v.InferOutput<typeof gitWorktreeRemoveBodySchema>
export type GitBranchDiffQuery = v.InferOutput<typeof gitBranchDiffQuerySchema>
