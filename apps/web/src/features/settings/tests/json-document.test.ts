import { getClient } from '@/lib/client'
import { fetchSettings, saveSettingsText } from '@/features/settings/utils/api'
import {
  parseSettingsJsonDocumentId,
  settingsJsonDocumentId,
  settingsJsonDocumentLabel,
} from '@/features/settings/utils/json-document'
import { documentLabel } from '@/features/workspace/utils/document-label'
import {
  editorBackedDocumentPath,
  fileBackedDocumentPath,
  savableDocumentPath,
} from '@/features/editor/utils/file-backed-document'

import { expect, test } from '../../../../test/fixtures'

test('a settings json id round-trips its layer and refuses anything else', () => {
  expect(parseSettingsJsonDocumentId(settingsJsonDocumentId('user'))).toBe('user')
  expect(parseSettingsJsonDocumentId(settingsJsonDocumentId('workspace'))).toBe('workspace')
  // `policy` is an environment variable with no file, so it is not a writable
  // target and must not resolve to a tab that offers to save it.
  expect(parseSettingsJsonDocumentId('settings-json:policy')).toBe(null)
  expect(parseSettingsJsonDocumentId('settings-json:')).toBe(null)
  expect(parseSettingsJsonDocumentId('/repo/settings.json')).toBe(null)
  expect(parseSettingsJsonDocumentId(null)).toBe(null)
})

// Both layers are called settings.json, so the layer has to survive into the tab.
test('the tab names which settings.json it is', () => {
  expect(documentLabel(settingsJsonDocumentId('user'))).toBe('settings.json (user)')
  expect(documentLabel(settingsJsonDocumentId('workspace'))).toBe('settings.json (workspace)')
  expect(settingsJsonDocumentLabel('settings-json:nonsense')).toBe('settings.json')
})

/**
 * The three questions the command gates ask, and the one tab that answers them
 * differently from every other surface: it is savable without being a file.
 */
test('a raw settings tab is savable and editable but is not a file', () => {
  const id = settingsJsonDocumentId('user')

  expect(savableDocumentPath(id)).toBe(id)
  expect(editorBackedDocumentPath(id)).toBe(id)
  // Load-bearing: `useSelectedFile` and the prefetch both gate on this, and a
  // non-null answer here sends them to read a file named `settings-json:user`.
  expect(fileBackedDocumentPath(id)).toBe(null)
})

test('the snapshot carries each layer bytes, so a JSON view needs no second fetch', async ({
  client,
}) => {
  expect(client).toBeDefined()
  await getClient().settings.raw.post({
    target: 'user',
    // A comment and an unregistered key: both have to survive, which is what
    // makes the raw view worth having over the form.
    text: '{\n  // why this is set\n  "editor.fontSize": 21,\n  "from.a.newer.build": true\n}\n',
  })

  const snapshot = await fetchSettings()
  const file = snapshot.layers.find((layer) => layer.id === 'user')?.file

  expect(file?.text).toContain('// why this is set')
  expect(file?.text).toContain('"from.a.newer.build"')
  expect(file?.parseErrors).toEqual([])
  expect(file?.revision).not.toBe('')
})

test('a raw save round-trips through the same route the tab uses', async ({ client }) => {
  expect(client).toBeDefined()
  const before = await fetchSettings()
  const revision = before.layers.find((layer) => layer.id === 'user')?.file?.revision

  const after = await saveSettingsText({
    baseRevision: revision,
    target: 'user',
    text: '{ "editor.fontSize": 19 }\n',
  })

  expect(after.values['editor.fontSize']).toBe(19)
  expect(after.layers.find((layer) => layer.id === 'user')?.file?.text).toBe(
    '{ "editor.fontSize": 19 }\n',
  )
})

// The buffer seeds from a revision, and the next save guards on it. A save that
// did not advance it would refuse every subsequent save of the same tab.
test('a stale base revision is refused rather than overwriting', async ({ client }) => {
  expect(client).toBeDefined()
  const before = await fetchSettings()
  const stale = before.layers.find((layer) => layer.id === 'user')?.file?.revision

  await saveSettingsText({
    baseRevision: stale,
    target: 'user',
    text: '{ "editor.fontSize": 17 }\n',
  })

  await expect(
    saveSettingsText({ baseRevision: stale, target: 'user', text: '{ "editor.fontSize": 18 }\n' }),
  ).rejects.toThrow()

  const after = await fetchSettings()
  expect(after.values['editor.fontSize']).toBe(17)
})
