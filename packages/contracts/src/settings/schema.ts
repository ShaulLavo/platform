import settingsJsonSchema from './schema.json' with { type: 'json' }
import type { SettingId } from './keys'

export type ReadonlyJsonValue =
  | boolean
  | number
  | string
  | null
  | readonly ReadonlyJsonValue[]
  | ReadonlyJsonObject

export type ReadonlyJsonObject = {
  readonly [key: string]: ReadonlyJsonValue
}

export type SettingsJsonSchema = ReadonlyJsonObject & {
  readonly $schema: 'http://json-schema.org/draft-07/schema#'
  readonly additionalProperties: false
  readonly properties: Readonly<Record<SettingId, ReadonlyJsonObject>>
  readonly type: 'object'
}

export const SETTINGS_JSON_SCHEMA = settingsJsonSchema as unknown as SettingsJsonSchema
