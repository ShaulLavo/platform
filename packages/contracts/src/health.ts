import * as v from 'valibot'
import { environmentIdSchema } from './chat-ids'
import { nonNegativeIntegerSchema, trimmedNonEmptyStringSchema } from './chat-model'

export const healthDescriptorSchema = v.looseObject({
  ok: v.literal(true),
  environmentId: environmentIdSchema,
  label: trimmedNonEmptyStringSchema,
  protocolVersion: nonNegativeIntegerSchema,
  serverVersion: trimmedNonEmptyStringSchema,
  platform: v.object({
    os: trimmedNonEmptyStringSchema,
    arch: trimmedNonEmptyStringSchema,
  }),
})

export type HealthDescriptor = v.InferOutput<typeof healthDescriptorSchema>
