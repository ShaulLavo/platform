import { mkdir, rename, rm, symlink, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { createOrchestrationFixture, executeGit } from '../../../test/factories/orchestration'

const fixtures: Awaited<ReturnType<typeof createOrchestrationFixture>>[] = []
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.close()))
})

test('registration receipts survive restart and retry before touching a missing directory', async () => {
  const fixture = await createOrchestrationFixture()
  fixtures.push(fixture)
  const first = await fixture.register(fixture.checkout, 'register-once')
  expect(first).toMatchObject({
    sequence: 2,
    deduped: false,
    result: { disposition: 'created-project' },
  })
  await rename(fixture.checkout, `${fixture.checkout}-moved`)
  await fixture.restart()
  expect(await fixture.register(fixture.checkout, 'register-once')).toEqual({
    ...first,
    deduped: true,
  })
  await expect(
    fixture.register(`${fixture.checkout}-moved`, 'register-once'),
  ).rejects.toMatchObject({ code: 'orchestration.COMMAND_ID_COLLISION' })
})

test('same checkout has one current worktree and durable no-event receipts', async () => {
  const fixture = await createOrchestrationFixture()
  fixtures.push(fixture)
  const first = await fixture.register()
  const alias = path.join(fixture.root, 'alias')
  await symlink(fixture.checkout, alias)
  const duplicate = await fixture.register(alias, 'register-alias')
  expect(duplicate).toMatchObject({
    sequence: 2,
    result: { ...first.result, disposition: 'existing-worktree' },
  })
  const model = await fixture.engine.readModelSnapshot()
  expect(model.projects.size).toBe(1)
  expect(model.worktrees.size).toBe(1)
  expect([...model.worktrees.values()][0]).toMatchObject({
    kind: 'current',
    ownership: 'protected',
    path: 'checkout',
    canonicalPath: fixture.checkout,
  })
  await fixture.restart()
  expect(await fixture.register(alias, 'register-alias')).toEqual({ ...duplicate, deduped: true })
})

test.each(['initialized', 'removed'] as const)(
  'live repository identity stays fixed when Git metadata is %s',
  async (change) => {
    const fixture = await createOrchestrationFixture({ repositoryCacheTtlMs: 0 })
    fixtures.push(fixture)
    if (change === 'removed') {
      await executeGit(fixture.checkout, 'init', '-b', 'main')
      await executeGit(
        fixture.checkout,
        'remote',
        'add',
        'origin',
        'https://github.com/acme/platform.git',
      )
    }
    const first = await fixture.register()
    const [original] = (await fixture.engine.readModelSnapshot()).projects.values()
    if (change === 'removed') await rm(path.join(fixture.checkout, '.git'), { recursive: true })
    if (change === 'initialized') await executeGit(fixture.checkout, 'init', '-b', 'main')
    const repository = (await fixture.registration.git.repo(fixture.checkout)).repository
    expect(repository !== null).toBe(change === 'initialized')

    expect(await fixture.register()).toMatchObject({
      sequence: first.sequence,
      result: { ...first.result, disposition: 'existing-worktree' },
    })
    expect([...(await fixture.engine.readModelSnapshot()).projects.values()]).toEqual([original])
  },
)

test('equivalent origins have stable project identity across different checkouts and servers', async () => {
  const left = await createOrchestrationFixture()
  fixtures.push(left)
  const right = await createOrchestrationFixture()
  fixtures.push(right)
  await executeGit(left.checkout, 'init', '-b', 'main')
  await executeGit(right.checkout, 'init', '-b', 'main')
  await executeGit(left.checkout, 'remote', 'add', 'origin', 'git@GitHub.com:Acme/Platform.git')
  await executeGit(right.checkout, 'remote', 'add', 'origin', 'https://github.com/acme/platform/')
  const a = await left.register()
  const b = await right.register()
  expect(a.result?.projectId).toBe(b.result?.projectId)
  expect(a.result?.worktreeId).not.toBe(b.result?.worktreeId)
  await executeGit(
    left.checkout,
    'remote',
    'set-url',
    'origin',
    'https://github.com/another/repository.git',
  )
  expect((await left.register()).result?.projectId).toBe(a.result?.projectId)
})

test('subdirectory registration canonicalizes to Git root and groups a second checkout', async () => {
  const fixture = await createOrchestrationFixture()
  fixtures.push(fixture)
  await executeGit(fixture.checkout, 'init', '-b', 'main')
  await executeGit(
    fixture.checkout,
    'remote',
    'add',
    'origin',
    'https://github.com/acme/platform.git',
  )
  const subdirectory = path.join(fixture.checkout, 'src')
  await mkdir(subdirectory)
  const first = await fixture.register(subdirectory)
  const other = path.join(fixture.root, 'other')
  await mkdir(other)
  await executeGit(other, 'init', '-b', 'main')
  await executeGit(other, 'remote', 'add', 'origin', 'git@github.com:acme/platform.git')
  const second = await fixture.register(other)
  expect(second.result).toMatchObject({
    projectId: first.result?.projectId,
    disposition: 'registered-worktree',
  })
  const worktrees = [...(await fixture.engine.readModelSnapshot()).worktrees.values()]
  expect(worktrees.filter((worktree) => worktree.kind === 'current')).toHaveLength(1)
  expect(worktrees.map((worktree) => worktree.canonicalPath).sort()).toEqual(
    [fixture.checkout, other].sort(),
  )
})

test('reviving another checkout makes the former current checkout linked when reopened', async () => {
  const fixture = await createOrchestrationFixture()
  fixtures.push(fixture)
  const other = path.join(fixture.root, 'other')
  await mkdir(other)
  for (const checkout of [fixture.checkout, other]) {
    await executeGit(checkout, 'init', '-b', 'main')
    await executeGit(checkout, 'remote', 'add', 'origin', 'https://github.com/acme/platform.git')
  }
  const original = await fixture.register()
  const linked = await fixture.register(other)
  if (!original.result || !linked.result) throw new TypeError('Missing registration')
  await fixture.command({
    type: 'project.delete',
    commandId: 'delete-project',
    projectId: original.result.projectId,
  })
  const revived = await fixture.register(other)
  expect(revived.result).toEqual({ ...linked.result, disposition: 'revived-project' })
  await fixture.restart()
  const reopened = await fixture.register()
  expect(reopened.result).toEqual({ ...original.result, disposition: 'registered-worktree' })
  const model = await fixture.engine.readModelSnapshot()
  expect(model.worktrees.get(original.result.worktreeId)).toMatchObject({
    kind: 'linked',
    ownership: 'external',
    retiredAt: null,
    registrationGeneration: 1,
  })
  expect(model.worktrees.get(linked.result.worktreeId)).toMatchObject({
    kind: 'current',
    ownership: 'protected',
    retiredAt: null,
    registrationGeneration: 1,
  })
  expect(
    [...model.worktrees.values()].filter((worktree) => worktree.kind === 'current'),
  ).toHaveLength(1)
})

test('create flag cannot create through a symlink outside the allowed filesystem', async () => {
  const fixture = await createOrchestrationFixture()
  fixtures.push(fixture)
  const outside = await createOrchestrationFixture()
  fixtures.push(outside)
  const alias = path.join(fixture.root, 'outside')
  await symlink(outside.checkout, alias)
  await expect(
    fixture.engine.dispatchClientCommand({
      type: 'project.create',
      commandId: 'outside',
      title: 'Outside',
      workspaceRoot: path.join(alias, 'new'),
      createWorkspaceRootIfMissing: true,
    }),
  ).rejects.toMatchObject({ code: 'PATH_OUTSIDE_WORKSPACE' })
  await expect(stat(path.join(outside.checkout, 'new'))).rejects.toMatchObject({ code: 'ENOENT' })
})

test('Git without origin uses its reachable root commit and empty Git refuses registration', async () => {
  const fixture = await createOrchestrationFixture()
  fixtures.push(fixture)
  await executeGit(fixture.checkout, 'init', '-b', 'main')
  await expect(fixture.register()).rejects.toMatchObject({
    code: 'orchestration.REPOSITORY_IDENTITY_UNAVAILABLE',
  })
  await writeFile(path.join(fixture.checkout, 'file'), 'root')
  await executeGit(fixture.checkout, 'add', '.')
  await executeGit(
    fixture.checkout,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '-m',
    'initial',
  )
  await fixture.register()
  const [project] = (await fixture.engine.readModelSnapshot()).projects.values()
  expect(project?.repositoryIdentity).toEqual({
    source: 'root-commit',
    canonical: await executeGit(fixture.checkout, 'rev-parse', 'HEAD'),
  })
})
