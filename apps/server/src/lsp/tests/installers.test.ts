import { mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTING_VALUES } from '@workspace/contracts'

import { downloadsDisabled, setLspDownloadPolicy, spawnRustAnalyzer } from '../installers'

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

/**
 * The shim, and why resolving past it is the whole point.
 *
 * `which rust-analyzer` finds `~/.cargo/bin/rust-analyzer` on any machine with
 * rustup, and that file is a proxy: unless the component is installed for the
 * active toolchain it prints `error: 'rust-analyzer' is not installed for the
 * toolchain '<tc>'` and exits — which this stack reports to the browser as a
 * socket closing with no message. The real server lives inside the toolchain.
 */
describe('rust-analyzer resolution', () => {
  it('never spawns the rustup shim', async ({ skip }) => {
    const root = await mkdtemp(path.join(tmpdir(), 'platform-rust-analyzer-'))
    try {
      const handle = await spawnRustAnalyzer(root)
      if (!handle) return skip('no rust-analyzer on this machine, shimmed or otherwise')

      const spawned = handle.process.spawnfile
      handle.process.kill()

      expect(path.dirname(spawned)).not.toBe(path.join(homedir(), '.cargo', 'bin'))
      expect(spawned.endsWith('rust-analyzer')).toBe(true)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  }, 30_000)
})
