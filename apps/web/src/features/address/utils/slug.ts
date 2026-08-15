import { stablePathHash } from '@/lib/stable-path-hash'
import { normalizeWorkspaceRoot, workspacePathLeaf } from '@/features/address/utils/workspace-path'

/**
 * A workspace is named in an address by a slug, never by a `ProjectId` and never by an
 * absolute path. `ProjectId` is a one-way hash and an absolute path is machine-private;
 * the slug is the leaf directory name, which is what the user already calls the project
 * and what the switcher already shows them.
 *
 * Slugs are only as stable as the set of remembered roots — opening a second checkout
 * named `platform` qualifies both. That instability is why `resolveWorkspaceSlug` falls
 * back to a leaf match: a link written before the collision keeps resolving, and only
 * becomes ambiguous when it genuinely is.
 */

/** `/~-` — a remembered app with no folder open. Not a legal leaf, so it cannot collide. */
export const NO_WORKSPACE_SLUG = '-'

const QUALIFIER_HASH_LENGTH = 4

export type WorkspaceSlugResolution =
  | { readonly kind: 'resolved'; readonly rootPath: string }
  | { readonly kind: 'ambiguous'; readonly rootPaths: readonly string[] }
  | { readonly kind: 'unknown' }

/**
 * The slug for one root, distinct from every other root passed in.
 *
 * Qualification carries the nearest distinguishing parent segment, matching what
 * `projectQualifiers` already puts in the switcher, so the URL and the menu name a
 * project the same way. The hash suffix is the last resort for roots whose parents
 * collide too — `/a/x/platform` and `/b/x/platform`.
 */
export function workspaceSlug(rootPath: string, allRootPaths: readonly string[]) {
  return (
    workspaceSlugs(allRootPaths).get(normalizeWorkspaceRoot(rootPath)) ??
    workspacePathLeaf(rootPath)
  )
}

/** Every root's slug in one pass, since a slug is a property of the whole set. */
export function workspaceSlugs(allRootPaths: readonly string[]) {
  const roots = Array.from(new Set(allRootPaths.map(normalizeWorkspaceRoot))).filter(Boolean)
  const byLeaf = groupBy(roots, workspacePathLeaf)
  const slugs = new Map<string, string>()

  for (const [leaf, group] of byLeaf) {
    if (group.length === 1) {
      slugs.set(group[0], leaf)
      continue
    }

    for (const [rootPath, slug] of qualifiedSlugs(leaf, group)) slugs.set(rootPath, slug)
  }

  return slugs
}

/**
 * Resolution order, cheapest and most certain first. Steps 1 and 2 read the workspace
 * index, which is already in localStorage; step 3 needs the file server's recent
 * directories, so callers that cannot afford the round trip may omit it and take
 * `unknown`.
 */
export function resolveWorkspaceSlug(
  slug: string,
  sources: { readonly indexed: readonly string[]; readonly recent?: readonly string[] },
): WorkspaceSlugResolution {
  // Deduped, not just normalized: callers legitimately concatenate sources — the
  // remembered index and the currently open root — and the same root arriving twice
  // must not read as two workspaces that happen to share a name.
  const indexed = Array.from(new Set(sources.indexed.map(normalizeWorkspaceRoot))).filter(Boolean)
  const slugs = workspaceSlugs(indexed)

  const exact = indexed.filter((rootPath) => slugs.get(rootPath) === slug)
  if (exact.length === 1) return { kind: 'resolved', rootPath: exact[0] }
  // A qualified slug can collide with another root's bare leaf (`/a/x/platform` →
  // `x-platform`, and a root literally named `x-platform`). Falling through to the
  // leaf match there would open a different workspace than the link named.
  if (exact.length > 1) return { kind: 'ambiguous', rootPaths: exact }

  const indexedByLeaf = indexed.filter((rootPath) => workspacePathLeaf(rootPath) === slug)
  if (indexedByLeaf.length === 1) return { kind: 'resolved', rootPath: indexedByLeaf[0] }
  if (indexedByLeaf.length > 1) return { kind: 'ambiguous', rootPaths: indexedByLeaf }

  return resolveFromRecent(slug, sources.recent ?? [])
}

function resolveFromRecent(slug: string, recent: readonly string[]): WorkspaceSlugResolution {
  const matches = Array.from(new Set(recent.map(normalizeWorkspaceRoot))).filter(
    (rootPath) => Boolean(rootPath) && workspacePathLeaf(rootPath) === slug,
  )
  if (matches.length === 1) return { kind: 'resolved', rootPath: matches[0] }
  if (matches.length > 1) return { kind: 'ambiguous', rootPaths: matches }

  return { kind: 'unknown' }
}

function qualifiedSlugs(leaf: string, group: readonly string[]) {
  const byParent = groupBy(group, parentSegment)
  const slugs: [string, string][] = []

  for (const [parent, sharing] of byParent) {
    const qualifier = parent ? `${parent}-${leaf}` : leaf
    if (sharing.length === 1) {
      slugs.push([sharing[0], qualifier])
      continue
    }

    for (const rootPath of sharing) {
      slugs.push([rootPath, `${qualifier}-${hashSuffix(rootPath)}`])
    }
  }

  return slugs
}

function parentSegment(rootPath: string) {
  return rootPath.split('/').filter(Boolean).at(-2) ?? ''
}

function hashSuffix(rootPath: string) {
  return stablePathHash(rootPath).slice(0, QUALIFIER_HASH_LENGTH)
}

function groupBy<T>(items: readonly T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>()

  for (const item of items) {
    const group = groups.get(key(item))
    if (!group) {
      groups.set(key(item), [item])
      continue
    }

    group.push(item)
  }

  return groups
}
