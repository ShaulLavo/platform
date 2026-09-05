import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createWorkspacePaths } from '../../../fs/path'
import { DEFAULT_MAX_TEXT_FILE_BYTES } from '../../../fs/limits'
import { GitService } from '../../../git/service'
import { OrchestrationEngine } from '../../engine'
import { createProjectionFixture } from './projection'

export async function discoveryFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-discovery-'))
  const main = path.join(root, 'main')
  await mkdir(main)
  const persistence = createProjectionFixture()
  const paths = createWorkspacePaths(root)
  const git = new GitService(paths, { maxTextFileBytes: DEFAULT_MAX_TEXT_FILE_BYTES })
  const registration = { git, paths }
  const engine = new OrchestrationEngine(persistence.database, {
    registration,
    providerRuntime: false,
  })
  await engine.ready
  return {
    root,
    main,
    registration,
    engine,
    getReadModel: () => persistence.snapshots.fullReadModel(),
    register: async (workspaceRoot = main) =>
      engine.dispatchClientCommand({
        type: 'project.create',
        commandId: `registration:${workspaceRoot}`,
        title: 'Discovery fixture',
        workspaceRoot,
      }),
    git: async (...args: string[]) => {
      const child = Bun.spawn(['git', ...args], { cwd: main, stdout: 'pipe', stderr: 'pipe' })
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])
      if (code !== 0) throw new TypeError(`Git fixture failed: ${stderr}`)
      return stdout.trim()
    },
    initializeGit: async () => {
      await writeFile(path.join(main, 'README.md'), '# Fixture\n')
      for (const args of [
        ['init', '-b', 'main'],
        ['add', '.'],
        [
          '-c',
          'user.name=Test',
          '-c',
          'user.email=test@example.invalid',
          'commit',
          '-m',
          'initial',
        ],
      ]) {
        const child = Bun.spawn(['git', ...args], { cwd: main, stdout: 'ignore', stderr: 'pipe' })
        const [stderr, code] = await Promise.all([new Response(child.stderr).text(), child.exited])
        if (code !== 0) throw new TypeError(`Git fixture failed: ${stderr}`)
      }
    },
    close: async () => {
      persistence.close()
      await rm(root, { recursive: true, force: true })
    },
  }
}
