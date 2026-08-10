import { describe, expect, it } from 'vitest'
import { parseWorktreeList } from '../worktree-list'

const NUL = '\0'

function record(...fields: string[]) {
  return `${fields.join(NUL)}${NUL}${NUL}`
}

describe('parseWorktreeList', () => {
  it('parses the main worktree and a linked branch worktree', () => {
    const output = [
      record('worktree /repo', 'HEAD abc123', 'branch refs/heads/main'),
      record(
        'worktree /repo/.git/platform-worktrees/s1',
        'HEAD def456',
        'branch refs/heads/session/s1',
      ),
    ].join('')

    expect(parseWorktreeList(output)).toEqual([
      {
        absolutePath: '/repo',
        bare: false,
        branch: 'main',
        commit: 'abc123',
        detached: false,
        locked: false,
        prunable: false,
      },
      {
        absolutePath: '/repo/.git/platform-worktrees/s1',
        bare: false,
        branch: 'session/s1',
        commit: 'def456',
        detached: false,
        locked: false,
        prunable: false,
      },
    ])
  })

  it('keeps flag attributes whether or not they carry a reason', () => {
    const output = [
      record('worktree /repo/a', 'HEAD abc123', 'detached', 'locked'),
      record(
        'worktree /repo/b',
        'HEAD def456',
        'branch refs/heads/x',
        'prunable gitdir file points to non-existent location',
      ),
    ].join('')
    const [detached, prunable] = parseWorktreeList(output)

    expect(detached).toMatchObject({ branch: null, detached: true, locked: true })
    expect(prunable).toMatchObject({ branch: 'x', locked: false, prunable: true })
  })

  it('returns nothing for empty output', () => {
    expect(parseWorktreeList('')).toEqual([])
  })
})
