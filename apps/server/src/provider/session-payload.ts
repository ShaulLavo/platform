import {
  interactionModeSchema,
  modelSelectionSchema,
  runtimeModeSchema,
  type ModelSelection,
} from '@workspace/contracts'
import * as v from 'valibot'

export const providerSessionRuntimePayloadSchema = v.object({
  cwd: v.optional(v.pipe(v.string(), v.minLength(1))),
  interactionMode: v.optional(interactionModeSchema),
  modelSelection: v.optional(modelSelectionSchema),
  runtimeMode: v.optional(runtimeModeSchema),
})

export type ProviderSessionRuntimePayload = v.InferOutput<
  typeof providerSessionRuntimePayloadSchema
>

export type ProviderRuntimeStartPayload = ProviderSessionRuntimePayload & {
  cwd: string
  modelSelection: ModelSelection
}
