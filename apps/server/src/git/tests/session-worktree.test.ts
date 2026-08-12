import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createWorkspacePaths } from '../../fs/path'
import { GitService } from '../service'
import { GitWorktreeService } from '../worktrees'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })))
})

describe('session worktrees', () => {
  it('gives a session its own checkout on its own branch', async () => {
    const root = await gitRepo()
    const worktrees = worktreeService(root)

    const created = await worktrees.create({ path: root, sessionId: 'session-a' })

    expect(created.created).toBe(true)
    expect(created.worktree.branch).toBe('session/session-a')
    // A different directory, not the project root — that separation is the
    // entire point: two agents editing one checkout stomp each other.
    expect(created.worktree.absolutePath).not.toBe(root)
    expect(await branchAt(created.worktree.absolutePath)).toBe('session/session-a')
    expect(await branchAt(root)).toBe('main')
  })

  it('returns the existing checkout instead of a second one', async () => {
    const root = await gitRepo()
    const worktrees = worktreeService(root)

    const first = await worktrees.create({ path: root, sessionId: 'session-a' })
    // Idempotent on the session id, which is what makes a retried send safe:
    // the client prepares the worktree before dispatching, so a network error
    // between the two must not strand a second checkout.
    const second = await worktrees.create({ path: root, sessionId: 'session-a' })

    expect(second.created).toBe(false)
    expect(second.worktree.absolutePath).toBe(first.worktree.absolutePath)
  })

  it('keeps two sessions from seeing each other’s edits', async () => {
    const root = await gitRepo()
    const worktrees = worktreeService(root)
    const a = await worktrees.create({ path: root, sessionId: 'session-a' })
    const b = await worktrees.create({ path: root, sessionId: 'session-b' })

    await writeFile(path.join(a.worktree.absolutePath, 'only-a.txt'), 'a\n')

    expect(await fileExists(path.join(a.worktree.absolutePath, 'only-a.txt'))).toBe(true)
    expect(await fileExists(path.join(b.worktree.absolutePath, 'only-a.txt'))).toBe(false)
    expect(await fileExists(path.join(root, 'only-a.txt'))).toBe(false)
  })
})

function worktreeService(root: string) {
  return new GitWorktreeService(new GitService(createWorkspacePaths(root)))
}

async function fileExists(target: string) {
  return Bun.file(target).exists()
}

async function branchAt(cwd: string) {
  return (await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
}

async function gitRepo() {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-session-worktree-'))
  roots.push(root)
  await runGit(root, ['init', '-b', 'main'])
  await runGit(root, ['config', 'user.email', 'test@example.com'])
  await runGit(root, ['config', 'user.name', 'Test User'])
  await writeFile(path.join(root, 'readme.md'), 'one\n')
  await runGit(root, ['add', 'readme.md'])
  await runGit(root, ['commit', '-m', 'initial'])

  return root
}

async function runGit(cwd: string, args: readonly string[]) {
  const child = Bun.spawn(['git', '-C', cwd].concat(args), { stderr: 'pipe', stdout: 'pipe' })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (exitCode === 0) return stdout

  throw new Error(`${stderr}${stdout}`.trim())
}
