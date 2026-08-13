import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { closeApp, createApp } from '../../app'
import { createWorkspacePaths } from '../../fs/path'
import { GitService } from '../service'
import { gitWorktreeErrors } from '../utils/worktree-errors'
import { GitWorktreeService } from '../worktrees'
import { testSettingsOptions } from '../../settings/testing'

const TRUSTED_ORIGIN = 'http://localhost:5173'
const SESSION_ROOT = '.git/platform-worktrees'

const apps: Array<ReturnType<typeof createApp>> = []
const roots: string[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => closeApp(app)))
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('session worktrees', () => {
  it('gives a session its own checkout without disturbing the main one', async () => {
    const root = await fixtureRepo()
    const worktrees = worktreeService(root)

    const created = await worktrees.create({ path: '', sessionId: 'alpha' })

    expect(created.created).toBe(true)
    expect(created.worktree).toMatchObject({
      branch: 'session/alpha',
      detached: false,
      main: false,
      path: `${SESSION_ROOT}/alpha`,
      sessionId: 'alpha',
    })

    // The session edits its own checkout: the main worktree neither sees the
    // file nor reports itself dirty, and it stays on its own branch.
    await writeFile(path.join(root, SESSION_ROOT, 'alpha', 'tracked.txt'), 'session\n')
    expect(await readFile(path.join(root, 'tracked.txt'), 'utf8')).toBe('one\n')
    expect((await runGit(root, ['status', '--porcelain'])).stdout).toBe('')
    expect((await runGit(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()).toBe('main')
  })

  it('reuses the existing checkout when the same session asks twice', async () => {
    const root = await fixtureRepo()
    const worktrees = worktreeService(root)
    const first = await worktrees.create({ path: '', sessionId: 'alpha' })

    const second = await worktrees.create({ path: '', sessionId: 'alpha' })

    expect(second.created).toBe(false)
    expect(second.worktree.absolutePath).toBe(first.worktree.absolutePath)
  })

  it('lists the main worktree first and attributes session checkouts', async () => {
    const root = await fixtureRepo()
    const worktrees = worktreeService(root)
    await worktrees.create({ path: '', sessionId: 'alpha' })

    const listed = await worktrees.list('')

    expect(listed).toHaveLength(2)
    expect(listed[0]).toMatchObject({ branch: 'main', main: true, path: '', sessionId: null })
    expect(listed[1]).toMatchObject({ main: false, sessionId: 'alpha' })
  })

  it('branches from an explicit base and records it for later diffs', async () => {
    const root = await fixtureRepo()
    await runGit(root, ['branch', 'release'])
    const worktrees = worktreeService(root)

    await worktrees.create({ base: 'release', path: '', sessionId: 'alpha' })

    const recorded = await runGit(root, ['config', '--get', 'branch.session/alpha.platform-base'])
    expect(recorded.stdout.trim()).toBe('release')
  })
})

describe('session branch diff', () => {
  it('returns every file the branch changed since it forked', async () => {
    const root = await fixtureRepo()
    const worktrees = worktreeService(root)
    const created = await worktrees.create({ path: '', sessionId: 'alpha' })
    const session = created.worktree.absolutePath
    await writeFile(path.join(session, 'added.txt'), 'added\n')
    await writeFile(path.join(session, 'tracked.txt'), 'changed\n')
    await runGit(session, ['add', '--all'])
    await runGit(session, ['commit', '-m', 'session work'])
    // A commit lands on the base after the fork: it belongs to the base, not to
    // the session, so the merge-base diff must not report it.
    await writeFile(path.join(root, 'base-only.txt'), 'base\n')
    await runGit(root, ['add', '--all'])
    await runGit(root, ['commit', '-m', 'base work'])

    const diff = await worktrees.branchDiff({ base: 'main', path: `${SESSION_ROOT}/alpha` })

    expect(diff.baseRef).toBe('main')
    expect(diff.headRef).toBe('session/alpha')
    expect(diff.files.map((file) => file.path).sort()).toEqual([
      `${SESSION_ROOT}/alpha/added.txt`,
      `${SESSION_ROOT}/alpha/tracked.txt`,
    ])
  })

  it('falls back to the base the worktree recorded when none is given', async () => {
    const root = await fixtureRepo()
    await runGit(root, ['branch', 'release'])
    const worktrees = worktreeService(root)
    await worktrees.create({ base: 'release', path: '', sessionId: 'alpha' })

    const diff = await worktrees.branchDiff({ path: `${SESSION_ROOT}/alpha` })

    expect(diff.baseRef).toBe('release')
    expect(diff.files).toEqual([])
  })

  it('rejects a base ref the repository does not have', async () => {
    const root = await fixtureRepo()
    const worktrees = worktreeService(root)
    await worktrees.create({ path: '', sessionId: 'alpha' })

    await expect(
      worktrees.branchDiff({ base: 'origin/never-fetched', path: `${SESSION_ROOT}/alpha` }),
    ).rejects.toMatchObject({ code: gitWorktreeErrors.WORKTREE_BASE_NOT_FOUND.code })
  })

  it('offers local and remote branches as base choices with a default', async () => {
    const root = await fixtureRepo()
    await runGit(root, ['branch', 'release'])
    const worktrees = worktreeService(root)
    await worktrees.create({ path: '', sessionId: 'alpha' })

    const bases = await worktrees.baseRefs(`${SESSION_ROOT}/alpha`)

    expect(bases.choices.map((choice) => choice.label).sort()).toEqual([
      'main',
      'release',
      'session/alpha',
    ])
    expect(bases.defaultChoiceId).toBe('local:main')
  })

  it('compares against the remote tracking ref when the base exists on both sides', async () => {
    const origin = await fixtureRepo()
    const clone = await mkdtemp(path.join(tmpdir(), 'platform-git-worktree-clone-'))
    roots.push(clone)
    await runGit(origin, ['clone', origin, clone])
    const worktrees = worktreeService(clone)
    const created = await worktrees.create({ path: '', sessionId: 'alpha' })
    await writeFile(path.join(created.worktree.absolutePath, 'added.txt'), 'added\n')
    await runGit(created.worktree.absolutePath, ['add', '--all'])
    await runGit(created.worktree.absolutePath, ['commit', '-m', 'session work'])

    const diff = await worktrees.branchDiff({ path: `${SESSION_ROOT}/alpha` })

    expect(diff.baseRef).toBe('origin/main')
    expect(diff.files.map((file) => file.path)).toEqual([`${SESSION_ROOT}/alpha/added.txt`])
  })
})

describe('session worktree removal', () => {
  it('refuses to delete uncommitted work without force', async () => {
    const root = await fixtureRepo()
    const worktrees = worktreeService(root)
    const created = await worktrees.create({ path: '', sessionId: 'alpha' })
    await writeFile(path.join(created.worktree.absolutePath, 'scratch.txt'), 'unsaved\n')

    await expect(
      worktrees.remove({ force: false, path: '', worktreePath: `${SESSION_ROOT}/alpha` }),
    ).rejects.toMatchObject({ code: gitWorktreeErrors.WORKTREE_DIRTY.code })
    expect(await readFile(path.join(created.worktree.absolutePath, 'scratch.txt'), 'utf8')).toBe(
      'unsaved\n',
    )
  })

  it('deletes a dirty worktree once force is explicit', async () => {
    const root = await fixtureRepo()
    const worktrees = worktreeService(root)
    const created = await worktrees.create({ path: '', sessionId: 'alpha' })
    await writeFile(path.join(created.worktree.absolutePath, 'scratch.txt'), 'unsaved\n')

    const result = await worktrees.remove({
      force: true,
      path: '',
      worktreePath: `${SESSION_ROOT}/alpha`,
    })

    expect(result.removed.sessionId).toBe('alpha')
    expect(result.worktrees).toHaveLength(1)
    expect((await runGit(root, ['worktree', 'list', '--porcelain'])).stdout).not.toContain('alpha')
  })

  it('removes a clean worktree without force, named by its absolute path', async () => {
    const root = await fixtureRepo()
    const worktrees = worktreeService(root)
    const created = await worktrees.create({ path: '', sessionId: 'alpha' })

    const result = await worktrees.remove({
      force: false,
      path: '',
      worktreePath: created.worktree.absolutePath,
    })

    expect(result.removed.sessionId).toBe('alpha')
    expect(result.worktrees.map((worktree) => worktree.sessionId)).toEqual([null])
  })

  it('refuses to remove the repository’s main worktree', async () => {
    const root = await fixtureRepo()
    const worktrees = worktreeService(root)

    await expect(
      worktrees.remove({ force: true, path: '', worktreePath: '' }),
    ).rejects.toMatchObject({ code: gitWorktreeErrors.WORKTREE_MAIN_PROTECTED.code })
  })
})

describe('worktree path containment', () => {
  it('rejects a removal path that escapes the workspace', async () => {
    const root = await fixtureRepo()
    const worktrees = worktreeService(root)

    await expect(
      worktrees.remove({ force: true, path: '', worktreePath: '../escape' }),
    ).rejects.toMatchObject({ code: 'PATH_OUTSIDE_WORKSPACE' })
  })

  it('rejects a path inside the workspace that is not a worktree', async () => {
    const root = await fixtureRepo()
    const worktrees = worktreeService(root)

    await expect(
      worktrees.remove({ force: true, path: '', worktreePath: 'tracked.txt' }),
    ).rejects.toMatchObject({ code: gitWorktreeErrors.WORKTREE_NOT_FOUND.code })
  })

  it('rejects a traversing session id before any directory is made', async () => {
    const root = await fixtureRepo()
    const app = testApp(root)

    const response = await app.handle(
      new Request('http://local/git/worktrees/create', {
        body: JSON.stringify({ sessionId: '../../escape' }),
        headers: trustedOriginHeaders({ 'content-type': 'application/json' }),
        method: 'POST',
      }),
    )

    expect(response.status).toBe(400)
    expect((await runGit(root, ['worktree', 'list', '--porcelain'])).stdout).not.toContain('escape')
  })

  it('creates and lists a session worktree over the real route', async () => {
    const root = await fixtureRepo()
    const app = testApp(root)

    const created = await app.handle(
      new Request('http://local/git/worktrees/create', {
        body: JSON.stringify({ sessionId: 'alpha' }),
        headers: trustedOriginHeaders({ 'content-type': 'application/json' }),
        method: 'POST',
      }),
    )
    const listed = await app.handle(
      new Request('http://local/git/worktrees', { headers: trustedOriginHeaders() }),
    )

    expect(created.status).toBe(200)
    expect(listed.status).toBe(200)
    const worktrees = (await listed.json()) as Array<{ path: string; sessionId: string | null }>
    expect(worktrees.map((worktree) => worktree.sessionId)).toEqual([null, 'alpha'])
  })
})

function worktreeService(root: string) {
  return new GitWorktreeService(new GitService(createWorkspacePaths(root)))
}

function testApp(root: string) {
  const app = createApp({
    auth: { allowedOrigins: [TRUSTED_ORIGIN] },
    settings: testSettingsOptions(root),
    watch: false,
    workspaceRoot: root,
  })
  apps.push(app)
  return app
}

async function fixtureRepo() {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-git-worktree-'))
  roots.push(root)
  await runGit(root, ['init', '-b', 'main'])
  await runGit(root, ['config', 'user.email', 'test@example.com'])
  await runGit(root, ['config', 'user.name', 'Test User'])
  await writeFile(path.join(root, 'tracked.txt'), 'one\n')
  await runGit(root, ['add', 'tracked.txt'])
  await runGit(root, ['commit', '-m', 'initial'])
  return root
}

async function runGit(root: string, args: readonly string[]) {
  const child = Bun.spawn(['git', '-C', root].concat(args), { stderr: 'pipe', stdout: 'pipe' })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (exitCode === 0) return { stderr, stdout }

  throw new Error(`${stderr}${stdout}`.trim())
}

function trustedOriginHeaders(headers: HeadersInit = {}) {
  return new Headers({ ...Object.fromEntries(new Headers(headers)), origin: TRUSTED_ORIGIN })
}
