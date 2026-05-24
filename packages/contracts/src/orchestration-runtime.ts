import * as v from 'valibot'
import { providerInstanceIdSchema, providerSlugSchema, type ProviderInstanceId } from './chat-ids'

export const runtimeModeSchema = v.picklist([
  'full-access',
  'approval-required',
  'auto-accept-edits',
])
export const interactionModeSchema = v.picklist(['default', 'plan'])

export const providerDriverKindSchema = v.pipe(providerSlugSchema, v.brand('ProviderDriverKind'))

export const modelSelectionSchema = v.object({
  providerInstanceId: providerInstanceIdSchema,
  model: v.pipe(v.string(), v.trim(), v.minLength(1)),
  options: v.optional(v.record(v.string(), v.unknown())),
})

export const providerUserInputAnswersSchema = v.record(v.string(), v.unknown())
export const providerApprovalDecisionSchema = v.picklist([
  'accept',
  'acceptForSession',
  'decline',
  'cancel',
])

export type RuntimeMode = v.InferOutput<typeof runtimeModeSchema>
export type InteractionMode = v.InferOutput<typeof interactionModeSchema>
export type ProviderDriverKind = v.InferOutput<typeof providerDriverKindSchema>
export type ModelSelection = v.InferOutput<typeof modelSelectionSchema>
export type ProviderUserInputAnswers = v.InferOutput<typeof providerUserInputAnswersSchema>
export type ProviderApprovalDecision = v.InferOutput<typeof providerApprovalDecisionSchema>

export const DEFAULT_RUNTIME_MODE = 'full-access' satisfies RuntimeMode
export const DEFAULT_INTERACTION_MODE = 'default' satisfies InteractionMode
export const DEFAULT_PROVIDER_DRIVER_KIND = 'codex' as ProviderDriverKind
export const DEFAULT_PROVIDER_INSTANCE_ID = 'codex' as ProviderInstanceId
