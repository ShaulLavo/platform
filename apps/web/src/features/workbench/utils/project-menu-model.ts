import { projectQualifiers } from '@/features/chat/lib/project-qualifiers'

export type ProjectMenuEntry = {
  /** Parent-path hint, set only when another entry shares this title. */
  readonly qualifier: string | null
  readonly rootPath: string
  readonly title: string
}

/**
 * What the project menu offers. Two sources, because neither alone is complete:
 * the file server's recents cover folders opened through the picker, and the
 * orchestration projects cover ones reached by clicking a chat session, which
 * never passes through the picker and so is never recorded as recent.
 *
 * The open root is always included so the menu can never contradict the title
 * sitting next to it, even before either source has loaded.
 */
export function projectMenuModel({
  activeRootPath,
  activeTitle,
  projects,
  recentFolders,
}: {
  readonly activeRootPath: string | null
  readonly activeTitle: string
  readonly projects: readonly { readonly title: string; readonly workspaceRoot: string }[]
  readonly recentFolders: readonly { readonly name: string; readonly path: string }[]
}): readonly ProjectMenuEntry[] {
  const byRootPath = new Map<string, string>()
  if (activeRootPath) byRootPath.set(activeRootPath, activeTitle)
  for (const folder of recentFolders) {
    if (byRootPath.has(folder.path)) continue

    byRootPath.set(folder.path, folder.name)
  }
  for (const project of projects) {
    if (byRootPath.has(project.workspaceRoot)) continue

    byRootPath.set(project.workspaceRoot, project.title)
  }

  const entries = [...byRootPath].map(([rootPath, title]) => ({
    id: rootPath,
    title,
    workspaceRoot: rootPath,
  }))
  const qualifiers = projectQualifiers(entries)

  return entries.map((entry) => ({
    qualifier: qualifiers.get(entry.id) ?? null,
    rootPath: entry.workspaceRoot,
    title: entry.title,
  }))
}
