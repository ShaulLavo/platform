import { describe, expect, it } from 'vitest'
import { normalizeWorkspaceCwd } from '../utils/workspace-cwd'

describe('normalizeWorkspaceCwd', () => {
  it('passes an already absolute path through untouched', () => {
    expect(normalizeWorkspaceCwd('/Users/shaul/Desktop/platform')).toBe(
      '/Users/shaul/Desktop/platform',
    )
  })

  /**
   * The projection stores workspace roots without a leading separator. Handing
   * one straight to `spawn` as `cwd` fails with ENOENT, which the Claude Agent
   * SDK reports as "native binary exists but failed to launch".
   */
  it('restores the leading separator on a stored workspace root', () => {
    expect(normalizeWorkspaceCwd('Users/shaul/Desktop/platform')).toBe(
      '/Users/shaul/Desktop/platform',
    )
    expect(normalizeWorkspaceCwd('Users/shaul/app')).toBe('/Users/shaul/app')
  })

  it('resolves any other relative path against the process cwd', () => {
    expect(normalizeWorkspaceCwd('some/nested/dir')).toBe(`${process.cwd()}/some/nested/dir`)
  })

  it('always returns an absolute path', () => {
    const inputs = ['/tmp', 'Users/shaul/x', 'relative/path', '.']
    for (const input of inputs) {
      expect(normalizeWorkspaceCwd(input).startsWith('/')).toBe(true)
    }
  })
})
