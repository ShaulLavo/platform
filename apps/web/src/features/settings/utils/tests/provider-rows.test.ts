import type { ProviderInstanceConfig, ProviderSnapshot } from '@workspace/contracts'

import { withProviderEnabled } from '@/features/settings/utils/patch'
import { providerSettingRows } from '@/features/settings/utils/provider-rows'
import { expect, test } from '../../../../../test/fixtures'

test('lists the providers that are running, not the ones that were saved', () => {
  // A fresh install has an empty settings document because the built-ins live
  // in the registry as constants. Listing the document showed "no providers
  // configured" on the one screen for configuring them, while two ran behind it.
  const rows = providerSettingRows({
    saved: [],
    snapshots: [snapshot('codex'), snapshot('claude')],
  })

  expect(rows.map((row) => row.providerInstanceId)).toEqual(['codex', 'claude'])
  expect(rows[0]?.enabled).toBe(true)
})

test('prefers the saved configuration where there is one', () => {
  const saved = { ...configFor('codex'), binaryPath: '/opt/bin/codex', enabled: false }

  expect(providerSettingRows({ saved: [saved], snapshots: [snapshot('codex')] })).toEqual([saved])
})

test('keeps a row for a saved instance whose driver never came up', () => {
  const saved = configFor('codex-broken')

  const rows = providerSettingRows({ saved: [saved], snapshots: [snapshot('codex')] })

  // Otherwise disabling something broken removes the only control that could
  // ever turn it back on.
  expect(rows.map((row) => row.providerInstanceId)).toEqual(['codex', 'codex-broken'])
})

test('toggling a provider the document has never mentioned appends it', () => {
  const instance = configFor('codex')

  // Mapping over the empty list silently dropped every toggle of the only two
  // providers that exist.
  expect(withProviderEnabled([], instance, false)).toEqual([{ ...instance, enabled: false }])
})

function snapshot(id: string): ProviderSnapshot {
  return {
    auth: { status: 'authenticated' },
    checkedAt: '2026-08-12T00:00:00.000Z',
    displayLabel: id,
    driverKind: id.startsWith('claude') ? 'claude' : 'codex',
    enabled: true,
    installed: true,
    models: [],
    providerInstanceId: id,
    status: 'ready',
    version: null,
  } as unknown as ProviderSnapshot
}

function configFor(id: string): ProviderInstanceConfig {
  return {
    binaryPath: '',
    config: {},
    displayLabel: id,
    driverKind: 'codex',
    enabled: true,
    environment: [],
    launchArgs: [],
    providerInstanceId: id,
  } as unknown as ProviderInstanceConfig
}
