import * as v from 'valibot'
import { providerInstanceIdSchema, providerSlugSchema, type ProviderInstanceId } from './chat-ids'

export const runtimeModeSchema = v.picklist([
  'full-access',
  'approval-required',
  'auto-accept-edits',
])
export const interactionModeSchema = v.picklist(['default', 'plan'])

export const providerDriverKindSchema = v.pipe(providerSlugSchema, v.brand('ProviderDriverKind'))

/**
 * Reasoning effort ids stay open strings: Codex speaks `low..ultra` and the
 * Claude SDK stops at `max`, so any closed enum shared across providers would
 * reject the other's levels.
 */
export const reasoningEffortSchema = v.pipe(v.string(), v.trim(), v.minLength(1))

/**
 * Still open — adapters read their own keys out of it — but the reasoning
 * effort is typed because it is the one option the picker, the persisted
 * per-thread selection, and every adapter must agree on. Typed *inside*
 * `options` rather than as a sibling field so the Codex adapter, which already
 * reads `options.reasoningEffort`, keeps working untouched.
 */
export const modelSelectionOptionsSchema = v.looseObject({
  reasoningEffort: v.optional(reasoningEffortSchema),
})

export const modelSelectionSchema = v.object({
  providerInstanceId: providerInstanceIdSchema,
  model: v.pipe(v.string(), v.trim(), v.minLength(1)),
  options: v.optional(modelSelectionOptionsSchema),
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
export type ModelSelectionOptions = v.InferOutput<typeof modelSelectionOptionsSchema>
export type ReasoningEffort = v.InferOutput<typeof reasoningEffortSchema>
export type ProviderUserInputAnswers = v.InferOutput<typeof providerUserInputAnswersSchema>
export type ProviderApprovalDecision = v.InferOutput<typeof providerApprovalDecisionSchema>

export const DEFAULT_RUNTIME_MODE = 'full-access' satisfies RuntimeMode
export const DEFAULT_INTERACTION_MODE = 'default' satisfies InteractionMode
export const DEFAULT_PROVIDER_DRIVER_KIND = 'codex' as ProviderDriverKind
export const DEFAULT_PROVIDER_INSTANCE_ID = 'codex' as ProviderInstanceId
