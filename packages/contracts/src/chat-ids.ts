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

export const projectIdSchema = opaqueIdSchema('ProjectId')
export const threadIdSchema = opaqueIdSchema('ThreadId')
export const messageIdSchema = opaqueIdSchema('MessageId')
export const turnIdSchema = opaqueIdSchema('TurnId')
export const commandIdSchema = opaqueIdSchema('CommandId')
export const eventIdSchema = opaqueIdSchema('EventId')
export const providerInstanceIdSchema = v.pipe(providerSlugSchema, v.brand('ProviderInstanceId'))
export const approvalRequestIdSchema = opaqueIdSchema('ApprovalRequestId')
export const proposedPlanIdSchema = opaqueIdSchema('ProposedPlanId')

export type ProjectId = v.InferOutput<typeof projectIdSchema>
export type ThreadId = v.InferOutput<typeof threadIdSchema>
export type MessageId = v.InferOutput<typeof messageIdSchema>
export type TurnId = v.InferOutput<typeof turnIdSchema>
export type CommandId = v.InferOutput<typeof commandIdSchema>
export type EventId = v.InferOutput<typeof eventIdSchema>
export type ProviderInstanceId = v.InferOutput<typeof providerInstanceIdSchema>
export type ApprovalRequestId = v.InferOutput<typeof approvalRequestIdSchema>
export type ProposedPlanId = v.InferOutput<typeof proposedPlanIdSchema>

export const stringIdSchema = trimmedNonEmptyStringSchema
