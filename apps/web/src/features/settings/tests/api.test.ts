import { DEFAULT_SETTING_VALUES } from '@workspace/contracts'

import { expect, test } from '../../../../test/fixtures'
import { fetchSettings, saveSettings } from '@/features/settings/utils/api'

test('reads registry defaults from an untouched server', async ({ client }) => {
  expect(client).toBeDefined()

  const snapshot = await fetchSettings()

  expect(snapshot.values).toEqual(DEFAULT_SETTING_VALUES)
  // An untouched install has no file at all, which is what keeps defaults live:
  // they come from the running build, never from a copy frozen on disk.
  expect(snapshot.layers.every((layer) => !layer.present)).toBe(true)
})

test('round-trips a saved document through the real server', async ({ client }) => {
  expect(client).toBeDefined()

  const saved = await saveSettings({
    edits: [
      {
        key: 'providers.instances',
        target: 'user',
        value: [{ providerInstanceId: 'codex', driverKind: 'codex', displayLabel: 'Codex' }],
      },
      {
        key: 'keybindings.overrides',
        target: 'user',
        value: { 'workspace.saveFile': 'mod+s' },
      },
    ],
  })

  expect(saved.values['providers.instances']).toEqual([
    {
      binaryPath: '',
      config: {},
      displayLabel: 'Codex',
      driverKind: 'codex',
      enabled: true,
      environment: [],
      providerInstanceId: 'codex',
    },
  ])
  expect(saved.values['keybindings.overrides']).toEqual({ 'workspace.saveFile': 'mod+s' })
  expect((await fetchSettings()).values).toEqual(saved.values)
})

test('surfaces the typed settings error for a rejected write', async ({ client }) => {
  expect(client).toBeDefined()

  // Duplicate instance ids never reach `saveSettings` through the UI, so the
  // edit is built raw here: the point is that the server, not the client, is
  // what refuses it.
  await expect(
    saveSettings({
      edits: [
        {
          key: 'providers.instances',
          target: 'user',
          value: [
            { providerInstanceId: 'codex', driverKind: 'codex' },
            { providerInstanceId: 'codex', driverKind: 'claude' },
          ],
        },
      ],
    }),
  ).rejects.toMatchObject({ code: 'settings.WRITE_INVALID' })

  expect((await fetchSettings()).values).toEqual(DEFAULT_SETTING_VALUES)
})

test('refuses an application-scoped key written to workspace settings', async ({ client }) => {
  expect(client).toBeDefined()

  // A workspace settings file ships inside a cloned repository. Provider config
  // carries a binary path and an environment, so it is readable only from the
  // user's own file — enforced by the server, not by the page hiding a control.
  await expect(
    saveSettings({
      edits: [
        {
          key: 'providers.instances',
          target: 'workspace',
          value: [{ providerInstanceId: 'codex', driverKind: 'codex' }],
        },
      ],
    }),
  ).rejects.toMatchObject({ code: 'settings.SCOPE_NOT_ALLOWED' })
})
