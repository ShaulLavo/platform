import { create } from 'zustand'

/**
 * What a commit's hooks have said so far, per repository.
 *
 * A store rather than mutation state because the lines arrive while the
 * mutation is still pending: TanStack Query has no notion of partial progress,
 * and the whole point is to show the hook talking before the commit resolves.
 *
 * Bounded, because a hook can run a whole test suite and its output is not
 * something anyone scrolls back through — the last screenful is what says
 * whether it is progressing or wedged.
 */
export const MAX_COMMIT_PROGRESS_LINES = 200

export type CommitProgressLine = {
  readonly stream: 'stderr' | 'stdout'
  readonly text: string
}

type CommitProgressState = {
  linesByRootPath: Readonly<Record<string, readonly CommitProgressLine[]>>
}

type CommitProgressActions = {
  appendCommitProgress: (rootPath: string, line: CommitProgressLine) => void
  clearCommitProgress: (rootPath: string) => void
}

export type CommitProgressStore = CommitProgressState & CommitProgressActions

const NO_LINES: readonly CommitProgressLine[] = []

export const useCommitProgressStore = create<CommitProgressStore>((set) => ({
  linesByRootPath: {},
  appendCommitProgress: (rootPath, line) =>
    set((state) => ({
      linesByRootPath: {
        ...state.linesByRootPath,
        [rootPath]: boundedLines(state.linesByRootPath[rootPath] ?? NO_LINES, line),
      },
    })),
  clearCommitProgress: (rootPath) =>
    set((state) => {
      if (!state.linesByRootPath[rootPath]) return state

      const { [rootPath]: _cleared, ...linesByRootPath } = state.linesByRootPath

      return { linesByRootPath }
    }),
}))

export function selectCommitProgress(
  state: Pick<CommitProgressStore, 'linesByRootPath'>,
  rootPath: string,
) {
  return state.linesByRootPath[rootPath] ?? NO_LINES
}

function boundedLines(lines: readonly CommitProgressLine[], line: CommitProgressLine) {
  const next = lines.concat(line)
  if (next.length <= MAX_COMMIT_PROGRESS_LINES) return next

  return next.slice(next.length - MAX_COMMIT_PROGRESS_LINES)
}

export function resetCommitProgressStore() {
  useCommitProgressStore.setState({ linesByRootPath: {} })
}
