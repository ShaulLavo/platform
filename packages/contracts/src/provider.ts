import * as v from 'valibot'
import { providerInstanceIdSchema, type ProviderInstanceId } from './chat-ids'
import {
  providerDriverKindSchema,
  runtimeModeSchema,
  type ProviderDriverKind,
} from './orchestration-runtime'
import { isoDateTimeSchema, trimmedNonEmptyStringSchema } from './chat-model'

export const providerAuthStatusSchema = v.picklist(['authenticated', 'unauthenticated', 'unknown'])
export const providerStatusSchema = v.picklist(['ready', 'warning', 'error', 'disabled'])
export const providerAvailabilitySchema = v.picklist(['available', 'unavailable'])

export const providerAuthSchema = v.object({
  status: providerAuthStatusSchema,
  type: v.optional(trimmedNonEmptyStringSchema),
  label: v.optional(trimmedNonEmptyStringSchema),
  email: v.optional(trimmedNonEmptyStringSchema),
})

export const providerModelSchema = v.object({
  slug: trimmedNonEmptyStringSchema,
  name: trimmedNonEmptyStringSchema,
  shortName: v.optional(trimmedNonEmptyStringSchema),
  isCustom: v.boolean(),
  capabilities: v.optional(v.nullable(v.record(v.string(), v.unknown())), null),
})

export const providerTraitsSchema = v.object({
  supportsApprovals: v.boolean(),
  supportsFullAccess: v.boolean(),
  supportsInterrupt: v.boolean(),
  supportsSessionStop: v.boolean(),
  supportsStreaming: v.boolean(),
  supportsUserInput: v.boolean(),
})

export const providerInstanceSettingsSchema = v.object({
  providerInstanceId: providerInstanceIdSchema,
  driverKind: providerDriverKindSchema,
  displayLabel: trimmedNonEmptyStringSchema,
  enabled: v.boolean(),
  runtimeModes: v.array(runtimeModeSchema),
  traits: providerTraitsSchema,
})

export const providerSnapshotSchema = v.object({
  providerInstanceId: providerInstanceIdSchema,
  driverKind: providerDriverKindSchema,
  displayLabel: trimmedNonEmptyStringSchema,
  enabled: v.boolean(),
  installed: v.boolean(),
  version: v.nullable(trimmedNonEmptyStringSchema),
  status: providerStatusSchema,
  auth: providerAuthSchema,
  checkedAt: isoDateTimeSchema,
  message: v.optional(trimmedNonEmptyStringSchema),
  availability: v.optional(providerAvailabilitySchema),
  models: v.array(providerModelSchema),
  runtimeModes: v.array(runtimeModeSchema),
  traits: providerTraitsSchema,
})

export const providerListResultSchema = v.object({
  providers: v.array(providerSnapshotSchema),
})

export type ProviderAuthStatus = v.InferOutput<typeof providerAuthStatusSchema>
export type ProviderStatus = v.InferOutput<typeof providerStatusSchema>
export type ProviderAvailability = v.InferOutput<typeof providerAvailabilitySchema>
export type ProviderAuth = v.InferOutput<typeof providerAuthSchema>
export type ProviderModel = v.InferOutput<typeof providerModelSchema>
export type ProviderTraits = v.InferOutput<typeof providerTraitsSchema>
export type ProviderInstanceSettings = v.InferOutput<typeof providerInstanceSettingsSchema>
export type ProviderSnapshot = v.InferOutput<typeof providerSnapshotSchema>
export type ProviderListResult = v.InferOutput<typeof providerListResultSchema>

export const DEFAULT_CODEX_PROVIDER_SETTINGS = {
  displayLabel: 'Codex',
  driverKind: 'codex' as ProviderDriverKind,
  enabled: true,
  providerInstanceId: 'codex' as ProviderInstanceId,
  runtimeModes: ['full-access'],
  traits: {
    supportsApprovals: false,
    supportsFullAccess: true,
    supportsInterrupt: true,
    supportsSessionStop: true,
    supportsStreaming: true,
    supportsUserInput: false,
  },
} satisfies ProviderInstanceSettings
