type DirectoryChurnEntry = {
  readonly count: number
  readonly path: string
}

type DirectoryChurnSummary = {
  readonly evictedDirectoryCount: number
  readonly topDirectories: readonly DirectoryChurnEntry[]
  readonly trackedDirectoryCount: number
}

export type DirectoryChurn = {
  record: (directories: readonly string[]) => void
  summary: () => DirectoryChurnSummary | null
}

const DEFAULT_MAX_TRACKED_DIRECTORIES = 256
const TOP_DIRECTORY_COUNT = 10

/**
 * Counts filesystem churn per directory so a wide event can report what
 * actually changed, not just how much. Directories, not files: storm churn is
 * usually transient files with unique names (temp saves, tool output), so
 * per-file counts would all be 1 while the shared parent directory is the
 * signal. Bounded: past twice `maxTrackedDirectories` the low-count entries
 * are dropped (their counts are lost), which keeps hot directories exact — a
 * storm hammering one directory survives compaction by definition.
 */
export function createDirectoryChurn(
  maxTrackedDirectories = DEFAULT_MAX_TRACKED_DIRECTORIES,
): DirectoryChurn {
  const counts = new Map<string, number>()
  let evictedDirectoryCount = 0

  return {
    record(directories) {
      for (const directory of directories) {
        counts.set(directory, (counts.get(directory) ?? 0) + 1)
      }
      if (counts.size <= maxTrackedDirectories * 2) return

      evictedDirectoryCount += compact(counts, maxTrackedDirectories)
    },
    summary() {
      if (counts.size === 0) return null

      return {
        evictedDirectoryCount,
        topDirectories: topEntries(counts, TOP_DIRECTORY_COUNT),
        trackedDirectoryCount: counts.size,
      }
    },
  }
}

function compact(counts: Map<string, number>, keep: number): number {
  const dropped = entriesByCountDesc(counts).slice(keep)
  for (const [directory] of dropped) counts.delete(directory)

  return dropped.length
}

function topEntries(counts: Map<string, number>, limit: number): DirectoryChurnEntry[] {
  return entriesByCountDesc(counts)
    .slice(0, limit)
    .map(([path, count]) => ({ count, path }))
}

function entriesByCountDesc(counts: Map<string, number>) {
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}
