import { expect, test } from 'vitest'
import * as v from 'valibot'
import { commandIdSchema } from '@workspace/contracts'
import {
  createDomainEngine,
  domainCommand,
  fixtureProjectId,
  fixtureWorktreeId,
  projectRegistrationCommand,
} from './factories/engine'

test.each([
  { repositoryKey: 'another-key' },
  { repositoryKind: 'git' as const },
  { repositoryIdentity: { source: 'root-commit' as const, canonical: '/workspace/project-1' } },
  { repositoryIdentity: { source: 'path' as const, canonical: '/another-repository' } },
])('refuses the same project ID with a conflicting identity: %j', async (identity) => {
  const { engine } = createDomainEngine()
  await engine.dispatch(projectRegistrationCommand())
  const before = await engine.shellSnapshot()

  await expect(
    engine.dispatch(
      projectRegistrationCommand(1, {
        ...identity,
        commandId: v.parse(commandIdSchema, 'collision'),
      }),
    ),
  ).rejects.toMatchObject({ code: 'orchestration.IDENTITY_COLLISION', status: 409 })

  expect(await engine.shellSnapshot()).toEqual(before)
})

test('refuses another project ID claiming the same live repository key', async () => {
  const { engine } = createDomainEngine()
  await engine.dispatch(projectRegistrationCommand())
  const before = await engine.shellSnapshot()

  await expect(
    engine.dispatch(projectRegistrationCommand(2, { repositoryKey: 'fixture-repository-1' })),
  ).rejects.toMatchObject({ code: 'orchestration.IDENTITY_COLLISION', status: 409 })

  expect(await engine.shellSnapshot()).toEqual(before)
})

test.each([
  { canonicalPath: '/another-checkout' },
  { projectId: fixtureProjectId(2), repositoryKey: 'another-key' },
])('refuses the same worktree ID with a conflicting owner or path: %j', async (identity) => {
  const { engine } = createDomainEngine()
  await engine.dispatch(projectRegistrationCommand())
  const before = await engine.shellSnapshot()

  await expect(
    engine.dispatch(
      projectRegistrationCommand(1, {
        ...identity,
        commandId: v.parse(commandIdSchema, 'collision'),
      }),
    ),
  ).rejects.toMatchObject({ code: 'orchestration.IDENTITY_COLLISION', status: 409 })

  expect(await engine.shellSnapshot()).toEqual(before)
})

test('refuses another worktree ID claiming the same live canonical path', async () => {
  const { engine } = createDomainEngine()
  await engine.dispatch(projectRegistrationCommand())
  const before = await engine.shellSnapshot()

  await expect(
    engine.dispatch(projectRegistrationCommand(2, { canonicalPath: '/workspace/project-1' })),
  ).rejects.toMatchObject({ code: 'orchestration.WORKTREE_PATH_TAKEN', status: 409 })

  expect(await engine.shellSnapshot()).toEqual(before)
})

test.each(['worktree.register', 'worktree.revive'] as const)(
  'refuses %s of a retired checkout without its current retirement sequence',
  async (type) => {
    const { engine } = createDomainEngine()
    await engine.dispatch(projectRegistrationCommand())
    await engine.dispatch(
      domainCommand({ type: 'project.delete', commandId: 'delete', projectId: fixtureProjectId() }),
    )
    await engine.dispatch(
      projectRegistrationCommand(1, {
        commandId: v.parse(commandIdSchema, 'revive-elsewhere'),
        worktreeId: fixtureWorktreeId(2),
        canonicalPath: '/workspace/project-2',
        path: 'project-2',
      }),
    )
    const retired = (await engine.readModelSnapshot()).worktrees.get(fixtureWorktreeId())
    if (!retired || retired.retirementSequence === null) throw new TypeError('Missing retirement')
    const before = await engine.shellSnapshot()

    await expect(
      engine.dispatch(
        domainCommand({
          ...projectRegistrationCommand(),
          type,
          commandId: 'invalid-revival',
          retirementSequence: retired.retirementSequence + 1,
          kind: 'linked',
          ownership: 'external',
        }),
      ),
    ).rejects.toMatchObject({ code: 'orchestration.IDENTITY_COLLISION', status: 409 })

    expect(await engine.shellSnapshot()).toEqual(before)
  },
)

test('refuses a second current worktree for a live project', async () => {
  const { engine } = createDomainEngine()
  await engine.dispatch(projectRegistrationCommand())
  const before = await engine.shellSnapshot()

  await expect(
    engine.dispatch(
      domainCommand({
        ...projectRegistrationCommand(2),
        type: 'worktree.register',
        projectId: fixtureProjectId(),
      }),
    ),
  ).rejects.toMatchObject({ code: 'orchestration.IDENTITY_COLLISION', status: 409 })

  expect(await engine.shellSnapshot()).toEqual(before)
})
