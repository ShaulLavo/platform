import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTING_VALUES } from '@workspace/contracts'

import { downloadsDisabled, setLspDownloadPolicy } from '../installers'

afterEach(() => {
  setLspDownloadPolicy(() => DEFAULT_SETTING_VALUES['lsp.downloadRuntimes'])
})

describe('LSP download policy', () => {
  it('allows downloads until something turns them off', () => {
    // Both directions, because the setting reads "may download" and the eleven
    // call sites ask "must not download". A dropped `!` inverts the product.
    expect(downloadsDisabled()).toBe(false)

    setLspDownloadPolicy(() => false)
    expect(downloadsDisabled()).toBe(true)

    setLspDownloadPolicy(() => true)
    expect(downloadsDisabled()).toBe(false)
  })
})
