import { describe, expect, it } from 'vitest'

import { settingsDocumentId } from '@/features/settings/utils/document'
import { settingsJsonDocumentId } from '@/features/settings/utils/json-document'
import { editorTabDocumentIds, isEditorTabDirty } from '@/features/workspace/utils/tab-dirty'

/**
 * One tab is usually one document. The settings tab is not: its text lives in a
 * buffer per scope, neither of which is keyed by the tab's own path — so every
 * caller that asked `tab.path` got `false` and the tab closed without a prompt,
 * taking the edits with it.
 */
describe('the documents behind a tab', () => {
  it('is the path itself for an ordinary file', () => {
    expect(editorTabDocumentIds('/repo/src/app.ts')).toEqual(['/repo/src/app.ts'])
  })

  it('is both scope buffers for the settings tab, and never the tab path', () => {
    const ids = editorTabDocumentIds(settingsDocumentId())

    expect(ids).toContain(settingsJsonDocumentId('user'))
    expect(ids).toContain(settingsJsonDocumentId('workspace'))
    expect(ids).not.toContain(settingsDocumentId())
  })
})

describe('tab dirtiness', () => {
  it('follows the file for an ordinary tab', () => {
    expect(isEditorTabDirty('/repo/a.ts', new Set(['/repo/a.ts']))).toBe(true)
    expect(isEditorTabDirty('/repo/a.ts', new Set(['/repo/b.ts']))).toBe(false)
  })

  // Either scope, so switching scope cannot hide the edit left on the other one.
  it('reports the settings tab dirty from either scope buffer', () => {
    expect(isEditorTabDirty(settingsDocumentId(), new Set([settingsJsonDocumentId('user')]))).toBe(
      true,
    )
    expect(
      isEditorTabDirty(settingsDocumentId(), new Set([settingsJsonDocumentId('workspace')])),
    ).toBe(true)
    expect(isEditorTabDirty(settingsDocumentId(), new Set())).toBe(false)
    // The tab path is never itself a dirty document, so this must not be true.
    expect(isEditorTabDirty(settingsDocumentId(), new Set([settingsDocumentId()]))).toBe(false)
  })
})
