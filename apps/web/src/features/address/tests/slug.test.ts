import { describe, expect, it } from 'vitest'

import { resolveWorkspaceSlug, workspaceSlug, workspaceSlugs } from '@/features/address/utils/slug'

const PLATFORM = '/Users/dev/code/platform'
const OTHER_PLATFORM = '/Users/dev/forks/platform'
const EDITOR = '/Users/dev/code/Editor'

describe('workspaceSlugs', () => {
  it('uses the bare leaf when it is unique', () => {
    const slugs = workspaceSlugs([PLATFORM, EDITOR])

    expect(slugs.get(PLATFORM)).toBe('platform')
    expect(slugs.get(EDITOR)).toBe('Editor')
  })

  it('qualifies by the nearest distinguishing parent when leaves collide', () => {
    const slugs = workspaceSlugs([PLATFORM, OTHER_PLATFORM])

    expect(slugs.get(PLATFORM)).toBe('code-platform')
    expect(slugs.get(OTHER_PLATFORM)).toBe('forks-platform')
  })

  it('falls back to a hash suffix when the parents collide too', () => {
    const a = '/Users/a/x/platform'
    const b = '/Users/b/x/platform'
    const slugs = workspaceSlugs([a, b])

    expect(slugs.get(a)).toMatch(/^x-platform-[0-9a-f]{4}$/)
    expect(slugs.get(b)).toMatch(/^x-platform-[0-9a-f]{4}$/)
    expect(slugs.get(a)).not.toBe(slugs.get(b))
  })

  it('is stable regardless of input order and ignores duplicates', () => {
    const forward = workspaceSlugs([PLATFORM, OTHER_PLATFORM, EDITOR])
    const backward = workspaceSlugs([EDITOR, OTHER_PLATFORM, PLATFORM, PLATFORM])

    expect(Object.fromEntries(backward)).toEqual(Object.fromEntries(forward))
  })

  it('normalizes trailing slashes so one root never gets two slugs', () => {
    const slugs = workspaceSlugs([PLATFORM, `${PLATFORM}/`])

    expect(slugs.size).toBe(1)
    expect(slugs.get(PLATFORM)).toBe('platform')
  })

  // Nested roots are real and documented: /repo and /repo/apps/web can both be open.
  it('gives nested roots distinct slugs', () => {
    const slugs = workspaceSlugs([PLATFORM, `${PLATFORM}/apps/web`])

    expect(slugs.get(PLATFORM)).toBe('platform')
    expect(slugs.get(`${PLATFORM}/apps/web`)).toBe('web')
  })
})

describe('workspaceSlug', () => {
  it('answers for one root out of a set', () => {
    expect(workspaceSlug(PLATFORM, [PLATFORM, OTHER_PLATFORM])).toBe('code-platform')
  })

  it('falls back to the leaf for a root outside the set', () => {
    expect(workspaceSlug(EDITOR, [PLATFORM])).toBe('Editor')
  })
})

describe('resolveWorkspaceSlug', () => {
  it('resolves an exact slug match', () => {
    expect(resolveWorkspaceSlug('code-platform', { indexed: [PLATFORM, OTHER_PLATFORM] })).toEqual({
      kind: 'resolved',
      rootPath: PLATFORM,
    })
  })

  // The payoff of step 2: a link written before a second checkout existed keeps working.
  it('resolves a bare leaf that a collision has since qualified', () => {
    expect(resolveWorkspaceSlug('platform', { indexed: [PLATFORM] })).toEqual({
      kind: 'resolved',
      rootPath: PLATFORM,
    })
  })

  // Callers concatenate the remembered index with the currently open root, so the
  // same path arrives twice as a matter of course. Reading that as two workspaces
  // made every deep link resolve to "no workspace named platform on this machine".
  it('does not read a repeated root as two workspaces', () => {
    expect(resolveWorkspaceSlug('platform', { indexed: [PLATFORM, PLATFORM] })).toEqual({
      kind: 'resolved',
      rootPath: PLATFORM,
    })
    expect(resolveWorkspaceSlug('platform', { indexed: [PLATFORM, `${PLATFORM}/`] })).toEqual({
      kind: 'resolved',
      rootPath: PLATFORM,
    })
  })

  it('reports ambiguity rather than guessing', () => {
    expect(resolveWorkspaceSlug('platform', { indexed: [PLATFORM, OTHER_PLATFORM] })).toEqual({
      kind: 'ambiguous',
      rootPaths: [PLATFORM, OTHER_PLATFORM],
    })
  })

  it('falls through to recent directories when the index has nothing', () => {
    expect(resolveWorkspaceSlug('platform', { indexed: [], recent: [PLATFORM, EDITOR] })).toEqual({
      kind: 'resolved',
      rootPath: PLATFORM,
    })
  })

  it('prefers the index over recents', () => {
    expect(
      resolveWorkspaceSlug('platform', { indexed: [PLATFORM], recent: [OTHER_PLATFORM] }),
    ).toEqual({ kind: 'resolved', rootPath: PLATFORM })
  })

  it('reports ambiguity among recents too', () => {
    expect(
      resolveWorkspaceSlug('platform', { indexed: [], recent: [PLATFORM, OTHER_PLATFORM] }),
    ).toEqual({ kind: 'ambiguous', rootPaths: [PLATFORM, OTHER_PLATFORM] })
  })

  it('is unknown when nothing matches, and when there is nothing to match against', () => {
    expect(resolveWorkspaceSlug('nope', { indexed: [PLATFORM], recent: [EDITOR] })).toEqual({
      kind: 'unknown',
    })
    expect(resolveWorkspaceSlug('platform', { indexed: [] })).toEqual({ kind: 'unknown' })
  })
})
