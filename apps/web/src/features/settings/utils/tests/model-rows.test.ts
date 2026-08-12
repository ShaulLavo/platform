import type { ModelPreferences, ProviderSnapshot } from '@workspace/contracts'

import { modelRows } from '@/features/settings/utils/model-rows'
import { expect, test } from '../../../../../test/fixtures'

test('lists what the providers offer, not only what was already decided', () => {
  // Settings remember opinions, so listing them meant the screen for forming an
  // opinion was empty until you had formed one somewhere else.
  const rows = modelRows(preferences(), [snapshot('codex', ['gpt-5-codex', 'gpt-5-codex-mini'])])

  expect(rows.map((row) => row.ref.model)).toEqual(['gpt-5-codex', 'gpt-5-codex-mini'])
  expect(rows.every((row) => !row.hidden)).toBe(true)
})

test('marks a model the user hid, and keeps the pinned order first', () => {
  const rows = modelRows(
    preferences({
      hidden: [{ model: 'gpt-5-codex-mini', providerInstanceId: 'codex' }],
      order: [{ model: 'gpt-5-codex-mini', providerInstanceId: 'codex' }],
    }),
    [snapshot('codex', ['gpt-5-codex', 'gpt-5-codex-mini'])],
  )

  expect(rows.map((row) => row.ref.model)).toEqual(['gpt-5-codex-mini', 'gpt-5-codex'])
  expect(rows[0]?.hidden).toBe(true)
})

test('keeps a row for a hidden model the provider stopped reporting', () => {
  const rows = modelRows(
    preferences({ hidden: [{ model: 'gpt-4-retired', providerInstanceId: 'codex' }] }),
    [snapshot('codex', ['gpt-5-codex'])],
  )

  // Without the row it stays hidden forever with nothing able to bring it back.
  expect(rows.map((row) => row.ref.model)).toEqual(['gpt-5-codex', 'gpt-4-retired'])
  expect(rows.at(-1)?.hidden).toBe(true)
})

function preferences(
  overrides: {
    hidden?: readonly { model: string; providerInstanceId: string }[]
    order?: readonly { model: string; providerInstanceId: string }[]
  } = {},
): ModelPreferences {
  return { hidden: [], order: [], ...overrides } as unknown as ModelPreferences
}

function snapshot(id: string, slugs: readonly string[]): ProviderSnapshot {
  return {
    auth: { status: 'authenticated' },
    checkedAt: '2026-08-12T00:00:00.000Z',
    displayLabel: id,
    driverKind: 'codex',
    enabled: true,
    installed: true,
    models: slugs.map((slug) => ({ slug })),
    providerInstanceId: id,
    status: 'ready',
    version: null,
  } as unknown as ProviderSnapshot
}
