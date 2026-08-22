import { createEditorDocumentStore } from '@/features/editor/state/document-state'
import { SettingsSyncService } from '@/features/settings/state/sync-service'
import { fetchSettings } from '@/features/settings/utils/api'
import { settingsJsonDocumentId } from '@/features/settings/utils/json-document'

import { createTestQueryClient } from '../../../../test/render'
import { expect, test } from '../../../../test/fixtures'

const ID = settingsJsonDocumentId('user')

/** A sentinel, not a credential: all that matters is that it is non-empty. */
const TYPED_BY_HAND = 'value-typed-into-the-raw-editor'

function documentWith(value: string) {
  return `${JSON.stringify(
    {
      'providers.instances': [
        {
          driverKind: 'codex',
          environment: [{ name: 'CODEX_TOKEN', value }],
          providerInstanceId: 'codex-work',
        },
      ],
    },
    null,
    2,
  )}\n`
}

/**
 * The one save that does not round-trip: the server lifts a provider credential
 * out of the document into the secret store and rewrites that subtree, so what
 * lands on disk is not what was posted.
 *
 * This is driven through the real service and the real server rather than
 * through the store, because the defect was in which text the service handed to
 * `markSettingsDocumentSaved` — pinning the store alone cannot see it.
 */
test('a save the server rewrites leaves the buffer clean and holding the file', async ({
  client,
}) => {
  expect(client).toBeDefined()
  const store = createEditorDocumentStore()
  const queryClient = createTestQueryClient()
  const posted = documentWith(TYPED_BY_HAND)

  const before = await fetchSettings()
  store.getState().ensureUnsyncedEditorDocument({
    content: posted,
    id: ID,
    sync: {
      kind: 'settings',
      revision: before.layers.find((layer) => layer.id === 'user')?.file?.revision ?? '',
      state: 'idle',
      target: 'user',
    },
  })

  await new SettingsSyncService(store, queryClient).save(
    store.getState().getLiveEditorDocument(ID)!,
  )

  const document = store.getState().getLiveEditorDocument(ID)
  // The credential is gone from the buffer, because it is gone from the file.
  expect(document?.buffer.materializeFullText()).not.toContain(TYPED_BY_HAND)
  // And the tab is clean: marking against the *written* text instead of the
  // posted text failed this check in exactly this case, leaving the tab dirty
  // forever with a secret on screen that the file no longer held.
  expect(document?.buffer.isDirty()).toBe(false)
  expect(store.getState().dirtyFilePaths.has(ID)).toBe(false)
  // The revision advanced, so the next save is not refused as stale.
  expect(document?.sync).toMatchObject({ kind: 'settings', target: 'user' })
  const sync = document?.sync
  expect(sync?.kind === 'settings' ? sync.revision : '').not.toBe('')
})

// The ordinary case still has to behave: no rewrite, buffer clean, text kept.
test('a save the server does not rewrite keeps the posted text', async ({ client }) => {
  expect(client).toBeDefined()
  const store = createEditorDocumentStore()
  const queryClient = createTestQueryClient()
  const posted = '{ "editor.fontSize": 19 }\n'

  const before = await fetchSettings()
  store.getState().ensureUnsyncedEditorDocument({
    content: posted,
    id: ID,
    sync: {
      kind: 'settings',
      revision: before.layers.find((layer) => layer.id === 'user')?.file?.revision ?? '',
      state: 'idle',
      target: 'user',
    },
  })

  await new SettingsSyncService(store, queryClient).save(
    store.getState().getLiveEditorDocument(ID)!,
  )

  const document = store.getState().getLiveEditorDocument(ID)
  expect(document?.buffer.materializeFullText()).toBe(posted)
  expect(document?.buffer.isDirty()).toBe(false)
  expect((await fetchSettings()).values['editor.fontSize']).toBe(19)
})
