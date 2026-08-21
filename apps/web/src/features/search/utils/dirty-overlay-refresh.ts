/**
 * The client-only overlay replays the last disk run's matches for every path that
 * is not currently dirty. That is only sound while the dirty set grows: once a
 * path *stops* being dirty, what is on disk at that path is unknown — the file
 * was saved, renamed away, or deleted — and replaying the previous run's matches
 * for it shows content that no longer exists. Re-running the disk search is the
 * only honest answer.
 */
export function searchResultsNeedDiskRefresh(
  overlaidPaths: ReadonlySet<string>,
  dirtyPaths: ReadonlySet<string>,
) {
  for (const path of overlaidPaths) {
    if (dirtyPaths.has(path)) continue

    return true
  }

  return false
}
