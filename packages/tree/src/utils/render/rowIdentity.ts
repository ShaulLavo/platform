import type { FileTreeVisibleRow } from '../model/publicTypes'

export function getFileTreeRowPath(row: FileTreeVisibleRow): string {
  return row.isFlattened
    ? (row.flattenedSegments?.findLast((segment) => segment.isTerminal)?.path ?? row.path)
    : row.path
}

export function getFileTreeRowAriaLabel(row: FileTreeVisibleRow): string {
  const flattenedSegments = row.flattenedSegments
  if (flattenedSegments == null || flattenedSegments.length === 0) {
    return row.name
  }

  return flattenedSegments.map((segment) => segment.name).join(' / ')
}

// Search keeps DOM focus on the built-in input, so the focused row still needs
// a stable DOM id for aria-activedescendant and visual-focus parity.
export function getFileTreeFocusedRowDomId(
  instanceId: string | undefined,
  path: string,
  parked: boolean,
): string | undefined {
  if (instanceId == null) {
    return undefined
  }

  return `${instanceId}__focused-item-${encodeURIComponent(path)}${parked ? '__parked' : ''}`
}
