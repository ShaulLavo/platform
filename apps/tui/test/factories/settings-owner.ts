import { createSettingsOwner } from '@workspace/client-core/settings/owner'
import { readSettings } from '@workspace/client-core/settings/read'
import type { Client } from '@workspace/client-core/transport/client'

export async function makeSettingsOwner(client: Client) {
  return createSettingsOwner({
    client,
    initialSnapshot: await readSettings({ client }),
    instanceId: 'settings-owner-test',
  })
}
