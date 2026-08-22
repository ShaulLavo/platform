export function treeCommandFocusCandidate({
  activeTreePath,
  firstPath,
  focusedPath,
  selectedPaths,
}: {
  readonly activeTreePath: string | null
  readonly firstPath: string | null
  readonly focusedPath: string | null
  readonly selectedPaths: readonly string[]
}) {
  return activeTreePath ?? focusedPath ?? selectedPaths[0] ?? firstPath
}
