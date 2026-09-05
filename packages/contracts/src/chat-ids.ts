import * as v from 'valibot'

const trimmedNonEmptyStringSchema = v.pipe(v.string(), v.trim(), v.minLength(1))
export const providerSlugSchema = v.pipe(
  trimmedNonEmptyStringSchema,
  v.maxLength(64),
  v.regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
)

function opaqueIdSchema<const Name extends string>(name: Name) {
  return v.pipe(trimmedNonEmptyStringSchema, v.brand(name))
}

function domainIdSchema<const Name extends string>(name: Name) {
  return v.pipe(v.string(), v.uuid(), v.brand(name))
}

export const environmentIdSchema = domainIdSchema('EnvironmentId')
export const projectIdSchema = domainIdSchema('ProjectId')
export const worktreeIdSchema = domainIdSchema('WorktreeId')
export const sessionIdSchema = domainIdSchema('SessionId')
export const providerBindingHandleSchema = opaqueIdSchema('ProviderBindingHandle')
export const providerConversationMarkerSchema = opaqueIdSchema('ProviderConversationMarker')
export const providerResumeCursorSchema = opaqueIdSchema('ProviderResumeCursor')
export const messageIdSchema = opaqueIdSchema('MessageId')
export const turnIdSchema = opaqueIdSchema('TurnId')
export const commandIdSchema = opaqueIdSchema('CommandId')
export const eventIdSchema = opaqueIdSchema('EventId')
export const providerInstanceIdSchema = v.pipe(providerSlugSchema, v.brand('ProviderInstanceId'))
export const approvalRequestIdSchema = opaqueIdSchema('ApprovalRequestId')
export const proposedPlanIdSchema = opaqueIdSchema('ProposedPlanId')

export type ProjectId = v.InferOutput<typeof projectIdSchema>
export type EnvironmentId = v.InferOutput<typeof environmentIdSchema>
export type WorktreeId = v.InferOutput<typeof worktreeIdSchema>
export type SessionId = v.InferOutput<typeof sessionIdSchema>
export type ProviderBindingHandle = v.InferOutput<typeof providerBindingHandleSchema>
export type ProviderConversationMarker = v.InferOutput<typeof providerConversationMarkerSchema>
export type ProviderResumeCursor = v.InferOutput<typeof providerResumeCursorSchema>
export type MessageId = v.InferOutput<typeof messageIdSchema>
export type TurnId = v.InferOutput<typeof turnIdSchema>
export type CommandId = v.InferOutput<typeof commandIdSchema>
export type EventId = v.InferOutput<typeof eventIdSchema>
export type ProviderInstanceId = v.InferOutput<typeof providerInstanceIdSchema>
export type ApprovalRequestId = v.InferOutput<typeof approvalRequestIdSchema>
export type ProposedPlanId = v.InferOutput<typeof proposedPlanIdSchema>

export const stringIdSchema = trimmedNonEmptyStringSchema

export type ScopedProjectRef = {
  readonly environmentId: EnvironmentId
  readonly projectId: ProjectId
}
export type ScopedWorktreeRef = {
  readonly environmentId: EnvironmentId
  readonly worktreeId: WorktreeId
}
export type ScopedSessionRef = {
  readonly environmentId: EnvironmentId
  readonly sessionId: SessionId
}

export function scopedProjectKey(ref: ScopedProjectRef): string {
  return `${ref.environmentId}:${ref.projectId}`
}

export function scopedWorktreeKey(ref: ScopedWorktreeRef): string {
  return `${ref.environmentId}:${ref.worktreeId}`
}

export function scopedSessionKey(ref: ScopedSessionRef): string {
  return `${ref.environmentId}:${ref.sessionId}`
}
