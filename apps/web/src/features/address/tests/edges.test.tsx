import { readSettingsCategory } from '@/features/settings/state/category-store'
import { settingsDocumentId } from '@/features/settings/settings-document'

import { expect, test } from '../../../../test/fixtures'
import {
  editorTabPaths,
  flushProjection,
  pressBack,
  recordHistoryWrites,
  renderAddressHarness,
  seedWorkspaceCache,
  startAt,
} from '../../../../test/address'

/**
 * The two edges, mounted. Everything here is about what happens BETWEEN the codec and
 * the stores — which the pure tests in this folder cannot see.
 */

const ROOT = '/repo'

test('a foreign link does not close the tabs the cache restored', async () => {
  // Twelve tabs remembered locally; a shared link naming two of them.
  const remembered = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'].map(
    (name) => `${ROOT}/${name}`,
  )
  seedWorkspaceCache({ rootPath: ROOT, tabPaths: remembered })
  startAt('/~repo/workbench/f/a.ts?tabs=f%2Fa.ts~f%2Fb.ts')

  const { harness } = await renderAddressHarness()
  await flushProjection()

  // Someone else's link is not an instruction to delete your workspace. The encoder
  // already refuses to emit a truncated tab set for exactly this reason.
  expect(editorTabPaths(harness.workspace)).toEqual(remembered)
})

test('going back does not answer with a push', async () => {
  seedWorkspaceCache({ rootPath: ROOT, tabPaths: [`${ROOT}/a.ts`, `${ROOT}/b.ts`] })
  const first = '/~repo/workbench/f/a.ts'
  startAt(first)

  const { harness } = await renderAddressHarness()
  await flushProjection()

  const history_ = recordHistoryWrites()
  try {
    // Navigate: selecting the other tab is an identity change, so the projection pushes.
    const panels = harness.workspace.getState().workbenchPanels
    harness.workspace
      .getState()
      .setWorkbenchPanels({ ...panels, activeEditorTabId: panels.editorTabs[1].id })
    await flushProjection()
    expect(history_.pushes).toHaveLength(1)

    // Now go back. The applier honours it — and the projection must answer with a
    // replace, not a push: `pushState` truncates the forward entry the user is
    // standing next to, so a push here destroys the forward button outright.
    await pressBack(first)

    expect(history_.pushes).toHaveLength(1)
  } finally {
    history_.restore()
  }
})

/**
 * `?settings=` was a one-way sink: `selectSettingsCategory` had no caller but the
 * applier, so nothing could undo a category a link had pinned, and the settings tab
 * carries no `?tabs=` token for `closeTabsOutsideAddress` to close.
 */
test('walking back out of settings closes it and clears the category', async () => {
  seedWorkspaceCache({ rootPath: ROOT, tabPaths: [`${ROOT}/a.ts`] })
  const withoutSettings = '/~repo/workbench/f/a.ts'
  startAt(withoutSettings)

  const { harness } = await renderAddressHarness()
  await flushProjection()

  await pressBack('/~repo/workbench/f/a.ts?settings=Providers')
  expect(readSettingsCategory()).toBe('Providers')
  expect(editorTabPaths(harness.workspace)).toContain(settingsDocumentId())

  await pressBack(withoutSettings)

  expect(editorTabPaths(harness.workspace)).not.toContain(settingsDocumentId())
  expect(readSettingsCategory()).toBeNull()
})

/**
 * A short link EXPANDS on arrival, and that is correct: the URL renders the whole
 * store, and after opening someone's link you really are at that file with your own
 * tabs open. What must hold is that expanding never drops what the link named, and
 * that it settles after one pass instead of rewriting forever.
 */
test('honouring a short link keeps every slot it named, then settles', async () => {
  seedWorkspaceCache({ rootPath: ROOT, tabPaths: [`${ROOT}/a.ts`] })
  startAt('/~repo/workbench/f/a.ts?side=git')

  await renderAddressHarness()
  await flushProjection()
  const settled = `${location.pathname}${location.search}`

  expect(settled).toContain('/~repo/workbench/f/a.ts')
  expect(settled).toContain('side=git')

  await flushProjection()
  expect(`${location.pathname}${location.search}`).toBe(settled)
})

/**
 * The strong version, for the only URLs the projection ever wrote itself. A popped
 * entry is by definition projection output, so re-rendering the store it restores must
 * reproduce it byte for byte — costing no history write at all.
 */
test('returning to an address this app wrote costs no write', async () => {
  seedWorkspaceCache({ rootPath: ROOT, tabPaths: [`${ROOT}/a.ts`, `${ROOT}/b.ts`] })
  startAt('/~repo/workbench/f/a.ts')

  const { harness } = await renderAddressHarness()
  await flushProjection()
  const first = `${location.pathname}${location.search}`

  const panels = harness.workspace.getState().workbenchPanels
  harness.workspace
    .getState()
    .setWorkbenchPanels({ ...panels, activeEditorTabId: panels.editorTabs[1].id })
  await flushProjection()

  const history_ = recordHistoryWrites()
  try {
    await pressBack(first)

    expect(history_.pushes).toEqual([])
    expect(history_.replaces).toEqual([])
    expect(`${location.pathname}${location.search}`).toBe(first)
  } finally {
    history_.restore()
  }
})
