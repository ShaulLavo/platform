import { DEFAULT_SETTINGS, settingsPatchSchema } from '@workspace/contracts'
import * as v from 'valibot'

import { expect, test } from '../../../../test/fixtures'
import { fetchSettings, saveSettings } from '../api'

test('reads contract defaults from an untouched server', async ({ client }) => {
  expect(client).toBeDefined()

  expect(await fetchSettings()).toEqual(DEFAULT_SETTINGS)
})

test('round-trips a saved document through the real server', async ({ client }) => {
  expect(client).toBeDefined()

  const saved = await saveSettings(
    v.parse(settingsPatchSchema, {
      keybindings: { 'workspace.saveFile': 'mod+s' },
      providerInstances: [
        { providerInstanceId: 'codex', driverKind: 'codex', displayLabel: 'Codex' },
      ],
    }),
  )

  expect(saved.providerInstances).toEqual([
    {
      binaryPath: '',
      config: {},
      displayLabel: 'Codex',
      driverKind: 'codex',
      enabled: true,
      environment: [],
      launchArgs: [],
      providerInstanceId: 'codex',
    },
  ])
  expect(saved.keybindings).toEqual({ 'workspace.saveFile': 'mod+s' })
  expect(await fetchSettings()).toEqual(saved)
})

test('surfaces the typed settings error for a rejected patch', async ({ client }) => {
  expect(client).toBeDefined()

  // Duplicate instance ids never reach `saveSettings` through the UI, so the
  // patch is built raw here: the point is that the server, not the client,
  // is what refuses it.
  await expect(
    saveSettings({
      providerInstances: [
        { providerInstanceId: 'codex', driverKind: 'codex' },
        { providerInstanceId: 'codex', driverKind: 'claude' },
      ],
    } as never),
  ).rejects.toMatchObject({ code: 'settings.PATCH_INVALID' })

  expect(await fetchSettings()).toEqual(DEFAULT_SETTINGS)
})
