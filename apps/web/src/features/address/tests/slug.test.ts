import { describe } from 'vitest'

import { expect, test } from '../../../../test/fixtures'

import { resolveWorkspaceSlug, workspaceSlug, workspaceSlugs } from '@/features/address/utils/slug'

const PLATFORM = '/Users/dev/code/platform'
const OTHER_PLATFORM = '/Users/dev/forks/platform'
const EDITOR = '/Users/dev/code/Editor'

describe('workspaceSlugs', () => {
  test('uses the bare leaf when it is unique', () => {
    const slugs = workspaceSlugs([PLATFORM, EDITOR])

    expect(slugs.get(PLATFORM)).toBe('platform')
    expect(slugs.get(EDITOR)).toBe('Editor')
  })

  test('qualifies by the nearest distinguishing parent when leaves collide', () => {
    const slugs = workspaceSlugs([PLATFORM, OTHER_PLATFORM])

    expect(slugs.get(PLATFORM)).toBe('code-platform')
    expect(slugs.get(OTHER_PLATFORM)).toBe('forks-platform')
  })

  test('falls back to a hash suffix when the parents collide too', () => {
    const a = '/Users/a/x/platform'
    const b = '/Users/b/x/platform'
    const slugs = workspaceSlugs([a, b])

    expect(slugs.get(a)).toMatch(/^x-platform-[0-9a-f]{4}$/)
    expect(slugs.get(b)).toMatch(/^x-platform-[0-9a-f]{4}$/)
    expect(slugs.get(a)).not.toBe(slugs.get(b))
  })

  // The encoder was minting `<parent>-<leaf>` without checking whether that name was
  // already some other root's bare leaf, so it produced a slug its own resolver then
  // called ambiguous — and BOTH workspaces stopped resolving.
  test('does not mint a qualifier that another root already answers to', () => {
    const work = '/dev/work/api'
    const oss = '/dev/oss/api'
    const literal = '/dev/repos/work-api'
    const slugs = workspaceSlugs([work, oss, literal])

    expect(slugs.get(literal)).toBe('work-api')
    expect(slugs.get(work)).not.toBe('work-api')
    expect(new Set(slugs.values()).size).toBe(3)
  })

  /**
   * The property the whole design rests on and nothing asserted: for one unchanged set
   * of roots, encoding a root and resolving the result must land back on that root.
   */
  test('round-trips every root in a colliding set', () => {
    const roots = [
      '/dev/work/api',
      '/dev/oss/api',
      '/dev/repos/work-api',
      '/Users/a/x/platform',
      '/Users/b/x/platform',
      '/Users/dev/code/platform',
      EDITOR,
    ]

    for (const rootPath of roots) {
      const slug = workspaceSlug(rootPath, roots)

      expect(resolveWorkspaceSlug(slug, { indexed: roots })).toEqual({
        kind: 'resolved',
        rootPath,
      })
    }
  })

  // `-` is a legal directory name, and `/~-` already means "no folder open".
  test('never hands a real workspace the no-folder slug', () => {
    const dash = '/Users/dev/code/-'

    expect(workspaceSlug(dash, [dash, EDITOR])).not.toBe('-')
  })

  test('is stable regardless of input order and ignores duplicates', () => {
    const forward = workspaceSlugs([PLATFORM, OTHER_PLATFORM, EDITOR])
    const backward = workspaceSlugs([EDITOR, OTHER_PLATFORM, PLATFORM, PLATFORM])

    expect(Object.fromEntries(backward)).toEqual(Object.fromEntries(forward))
  })

  test('normalizes trailing slashes so one root never gets two slugs', () => {
    const slugs = workspaceSlugs([PLATFORM, `${PLATFORM}/`])

    expect(slugs.size).toBe(1)
    expect(slugs.get(PLATFORM)).toBe('platform')
  })

  // Nested roots are real and documented: /repo and /repo/apps/web can both be open.
  test('gives nested roots distinct slugs', () => {
    const slugs = workspaceSlugs([PLATFORM, `${PLATFORM}/apps/web`])

    expect(slugs.get(PLATFORM)).toBe('platform')
    expect(slugs.get(`${PLATFORM}/apps/web`)).toBe('web')
  })
})

describe('workspaceSlug', () => {
  test('answers for one root out of a set', () => {
    expect(workspaceSlug(PLATFORM, [PLATFORM, OTHER_PLATFORM])).toBe('code-platform')
  })

  test('falls back to the leaf for a root outside the set', () => {
    expect(workspaceSlug(EDITOR, [PLATFORM])).toBe('Editor')
  })
})

describe('resolveWorkspaceSlug', () => {
  test('resolves an exact slug match', () => {
    expect(resolveWorkspaceSlug('code-platform', { indexed: [PLATFORM, OTHER_PLATFORM] })).toEqual({
      kind: 'resolved',
      rootPath: PLATFORM,
    })
  })

  // The payoff of step 2: a link written before a second checkout existed keeps working.
  test('resolves a bare leaf that a collision has since qualified', () => {
    expect(resolveWorkspaceSlug('platform', { indexed: [PLATFORM] })).toEqual({
      kind: 'resolved',
      rootPath: PLATFORM,
    })
  })

  // Callers concatenate the remembered index with the currently open root, so the
  // same path arrives twice as a matter of course. Reading that as two workspaces
  // made every deep link resolve to "no workspace named platform on this machine".
  test('does not read a repeated root as two workspaces', () => {
    expect(resolveWorkspaceSlug('platform', { indexed: [PLATFORM, PLATFORM] })).toEqual({
      kind: 'resolved',
      rootPath: PLATFORM,
    })
    expect(resolveWorkspaceSlug('platform', { indexed: [PLATFORM, `${PLATFORM}/`] })).toEqual({
      kind: 'resolved',
      rootPath: PLATFORM,
    })
  })

  test('reports ambiguity rather than guessing', () => {
    expect(resolveWorkspaceSlug('platform', { indexed: [PLATFORM, OTHER_PLATFORM] })).toEqual({
      kind: 'ambiguous',
      rootPaths: [PLATFORM, OTHER_PLATFORM],
    })
  })

  test('falls through to recent directories when the index has nothing', () => {
    expect(resolveWorkspaceSlug('platform', { indexed: [], recent: [PLATFORM, EDITOR] })).toEqual({
      kind: 'resolved',
      rootPath: PLATFORM,
    })
  })

  test('prefers the index over recents', () => {
    expect(
      resolveWorkspaceSlug('platform', { indexed: [PLATFORM], recent: [OTHER_PLATFORM] }),
    ).toEqual({ kind: 'resolved', rootPath: PLATFORM })
  })

  test('reports ambiguity among recents too', () => {
    expect(
      resolveWorkspaceSlug('platform', { indexed: [], recent: [PLATFORM, OTHER_PLATFORM] }),
    ).toEqual({ kind: 'ambiguous', rootPaths: [PLATFORM, OTHER_PLATFORM] })
  })

  test('is unknown when nothing matches, and when there is nothing to match against', () => {
    expect(resolveWorkspaceSlug('nope', { indexed: [PLATFORM], recent: [EDITOR] })).toEqual({
      kind: 'unknown',
    })
    expect(resolveWorkspaceSlug('platform', { indexed: [] })).toEqual({ kind: 'unknown' })
  })
})
