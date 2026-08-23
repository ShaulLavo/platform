import path from 'node:path'

import { SETTINGS_JSON_SCHEMA } from '@workspace/contracts'

import type { LanguageServerDocumentTarget } from '@/features/editor/utils/language-server-plugin'
import {
  SETTINGS_JSON_DOCUMENT_IDS,
  settingsJsonDocumentId,
} from '@/features/settings/utils/json-document'
import { SETTINGS_LANGUAGE_SERVER_TARGET } from '@/features/settings/utils/language-server'
import { expect, test } from '../../../../test/fixtures'

test('uses a relative JSON match path without changing the synthetic document ids', () => {
  expect(path.posix.isAbsolute(SETTINGS_LANGUAGE_SERVER_TARGET.matchPath)).toBe(false)
  expect(SETTINGS_LANGUAGE_SERVER_TARGET.matchPath.startsWith('../')).toBe(false)
  expect(SETTINGS_LANGUAGE_SERVER_TARGET.matchPath.endsWith('.json')).toBe(true)
  expect(settingsJsonDocumentId('user')).toBe('settings-json:user')
  expect(settingsJsonDocumentId('workspace')).toBe('settings-json:workspace')
  expect(SETTINGS_LANGUAGE_SERVER_TARGET.matchPath).not.toBe(settingsJsonDocumentId('user'))
})

test('sends the complete generated association only to JSON LS', () => {
  const notifications = SETTINGS_LANGUAGE_SERVER_TARGET.sharedNotificationsByServer
  const association = schemaAssociations(notifications['json-ls'][0]?.params)[0]

  expect(Object.keys(notifications)).toEqual(['json-ls'])
  expect(association).toEqual({
    uri: 'platform://schemas/settings',
    fileMatch: SETTINGS_JSON_DOCUMENT_IDS,
    schema: SETTINGS_JSON_SCHEMA,
  })
  expect(association?.schema).toBe(SETTINGS_JSON_SCHEMA)
  expect(association?.fileMatch).toEqual(['settings-json:user', 'settings-json:workspace'])
})

test('keeps the settings validator as the sole diagnostics owner', () => {
  expect(SETTINGS_LANGUAGE_SERVER_TARGET.disabledFeatures).toEqual(['diagnostics'])
})

test('leaves ordinary editor targets without the settings association', () => {
  const ordinaryTarget: LanguageServerDocumentTarget = { matchPath: 'package.json' }

  expect(ordinaryTarget.sharedNotificationsByServer).toBeUndefined()
  expect(ordinaryTarget.disabledFeatures).toBeUndefined()
})

function schemaAssociations(params: unknown): readonly SchemaAssociation[] {
  if (!Array.isArray(params)) return []
  const argument = params[0]
  if (!Array.isArray(argument)) return []

  return argument as readonly SchemaAssociation[]
}

type SchemaAssociation = {
  readonly fileMatch: readonly string[]
  readonly schema: unknown
  readonly uri: string
}
