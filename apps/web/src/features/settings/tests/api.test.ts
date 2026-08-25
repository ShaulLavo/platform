import { DEFAULT_SETTING_VALUES } from '@workspace/contracts'
import { vi } from 'vitest'

import { expect, test } from '../../../../test/fixtures'
import { fetchSettings, saveSettings, saveSettingsText } from '@/features/settings/utils/api'
import { log } from '@/lib/client-logging'

test('reads registry defaults from an untouched server', async ({ client }) => {
  expect(client).toBeDefined()

  const snapshot = await fetchSettings()

  expect(snapshot.values).toEqual(DEFAULT_SETTING_VALUES)
  expect(snapshot.layers.every((layer) => !layer.present)).toBe(true)
})

test('round-trips semantic operations through the real server', async ({ client }) => {
  expect(client).toBeDefined()

  const result = await saveSettings({
    mutationId: 'api-round-trip',
    operations: [
      { key: 'workbench.colorTheme', kind: 'set', value: 'dark' },
      { command: 'workspace.saveFile', keys: 'mod+s', kind: 'keybinding.set' },
    ],
    target: 'user',
  })

  expect(result.snapshot.values['workbench.colorTheme']).toBe('dark')
  expect(result.snapshot.values['keybindings.overrides']).toEqual({
    'workspace.saveFile': 'mod+s',
  })
  expect((await fetchSettings()).values).toEqual(result.snapshot.values)
})

test('rejects a retained mutation id reused for another intent', async ({ client }) => {
  expect(client).toBeDefined()

  await saveSettings({
    mutationId: 'api-id-collision',
    operations: [{ key: 'workbench.colorTheme', kind: 'set', value: 'dark' }],
    target: 'user',
  })

  await expect(
    saveSettings({
      mutationId: 'api-id-collision',
      operations: [{ key: 'workbench.colorTheme', kind: 'set', value: 'light' }],
      target: 'user',
    }),
  ).rejects.toMatchObject({ code: 'settings.ID_COLLISION' })

  expect((await fetchSettings()).values['workbench.colorTheme']).toBe('dark')
})

test('refuses an application-scoped key written to workspace settings', async ({ client }) => {
  expect(client).toBeDefined()

  await expect(
    saveSettings({
      mutationId: 'api-scope-rejection',
      operations: [
        {
          key: 'chat.defaultRuntimeMode',
          kind: 'set',
          value: 'approval-required',
        },
      ],
      target: 'workspace',
    }),
  ).rejects.toMatchObject({ code: 'settings.SCOPE_NOT_ALLOWED' })
})

test('raw telemetry distinguishes apply, duplicate acknowledgement, conflict, and rejection', async ({
  client,
}) => {
  expect(client).toBeDefined()
  const info = vi.spyOn(log, 'info').mockImplementation(() => undefined)
  const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined)
  const before = await fetchSettings()
  const baseRevision = before.layers.find((layer) => layer.id === 'user')?.file?.revision ?? ''
  const request = {
    baseRevision,
    target: 'user' as const,
    text: '{ "editor.fontSize": 18 }\n',
    writeId: 'api-raw-telemetry',
  }

  await saveSettingsText(request)
  await saveSettingsText(request)
  await expect(
    saveSettingsText({
      ...request,
      text: '{ "editor.fontSize": 19 }\n',
    }),
  ).rejects.toMatchObject({ code: 'settings.ID_COLLISION' })
  await expect(
    saveSettingsText({
      ...request,
      text: '{ "editor.fontSize": 20 }\n',
      writeId: 'api-raw-stale',
    }),
  ).rejects.toMatchObject({ code: 'settings.RAW_REVISION_STALE' })

  expect(settingsWriteOutcomes(info.mock.calls)).toEqual(['applied', 'duplicate-ack'])
  expect(settingsWriteOutcomes(warn.mock.calls)).toEqual(['rejected', 'raw-conflict'])
  info.mockRestore()
  warn.mockRestore()
})

function settingsWriteOutcomes(calls: readonly unknown[][]) {
  return calls.flatMap(([event]) => {
    if (!event || typeof event !== 'object') return []
    if (!('action' in event) || event.action !== 'settings.write-raw') return []

    return 'outcome' in event && typeof event.outcome === 'string' ? [event.outcome] : []
  })
}
