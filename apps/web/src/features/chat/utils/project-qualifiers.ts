/**
 * Folder-derived titles are leaves, so several checkouts of the same repo all read
 * as one name. Where a title repeats, carry the nearest distinguishing parent segment
 * so picking the wrong one — which swaps the whole workspace — is not a coin flip.
 *
 * Only ambiguous entries get a qualifier: annotating every one would be noise.
 */
export function projectQualifiers<TId extends string>(
  projects: readonly { readonly id: TId; readonly title: string; readonly workspaceRoot: string }[],
) {
  const countsByTitle = new Map<string, number>()
  for (const project of projects) {
    countsByTitle.set(project.title, (countsByTitle.get(project.title) ?? 0) + 1)
  }

  const qualifiers = new Map<TId, string>()
  for (const project of projects) {
    if ((countsByTitle.get(project.title) ?? 0) < 2) continue

    qualifiers.set(project.id, projectQualifier(project.workspaceRoot))
  }

  return qualifiers
}

function projectQualifier(workspaceRoot: string) {
  const segments = workspaceRoot.split('/').filter(Boolean)
  const parent = segments.at(-2)
  if (!parent) return workspaceRoot

  return parent
}
