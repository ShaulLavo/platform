import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { ensureCommandWorkspaceRoot } from '../workspace-root'
import type { OrchestrationCommand } from '../schemas'

const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { force: true, recursive: true })
  }
})

async function scratchDir() {
  const root = await mkdtemp(path.join(tmpdir(), 'workspace-root-'))
  roots.push(root)

  return root
}

function projectCreate(
  workspaceRoot: string,
  createWorkspaceRootIfMissing?: boolean,
): OrchestrationCommand {
  return {
    commandId: 'cmd-1',
    createWorkspaceRootIfMissing,
    defaultModelSelection: null,
    projectId: 'project-1',
    title: 'Platform',
    type: 'project.create',
    workspaceRoot,
  } as OrchestrationCommand
}

describe('project workspace root', () => {
  it('creates the directory a project opted into making', async () => {
    const parent = await scratchDir()
    const workspaceRoot = path.join(parent, 'nested', 'platform')

    await ensureCommandWorkspaceRoot(projectCreate(workspaceRoot, true))

    expect((await stat(workspaceRoot)).isDirectory()).toBe(true)
  })

  it('leaves a missing root alone unless the command asked', async () => {
    const parent = await scratchDir()
    const workspaceRoot = path.join(parent, 'not-created')

    await ensureCommandWorkspaceRoot(projectCreate(workspaceRoot))
    await ensureCommandWorkspaceRoot(projectCreate(workspaceRoot, false))

    // The decider's own guard is what rejects it; this step only ever adds.
    await expect(stat(workspaceRoot)).rejects.toThrow()
  })

  it('is idempotent, because a replayed command must not fail on its own work', async () => {
    const workspaceRoot = path.join(await scratchDir(), 'platform')
    await ensureCommandWorkspaceRoot(projectCreate(workspaceRoot, true))

    await expect(
      ensureCommandWorkspaceRoot(projectCreate(workspaceRoot, true)),
    ).resolves.toBeUndefined()
  })

  it('refuses a path a file already occupies rather than reporting success', async () => {
    const workspaceRoot = path.join(await scratchDir(), 'platform')
    await writeFile(workspaceRoot, 'not a directory')

    await expect(ensureCommandWorkspaceRoot(projectCreate(workspaceRoot, true))).rejects.toThrow(
      /not a directory/i,
    )
  })

  it('ignores every command that is not a project creation', async () => {
    const workspaceRoot = path.join(await scratchDir(), 'platform')

    await ensureCommandWorkspaceRoot({
      commandId: 'cmd-2',
      projectId: 'project-1',
      title: 'Renamed',
      type: 'project.meta.update',
      workspaceRoot,
    } as unknown as OrchestrationCommand)

    await expect(stat(workspaceRoot)).rejects.toThrow()
  })
})
