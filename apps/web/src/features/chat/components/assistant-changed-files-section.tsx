import { useState } from 'react'

import { canOpenCheckpointDiff } from '../lib/checkpoint-diff-query'
import { hasNonZeroChatTurnDiffStat, summarizeChatTurnDiffStats } from '../lib/chat-turn-diff-tree'
import type { ChatTurnDiffSummary } from '../state/chat-projection-store'
import { AssistantChangedFilesTree } from './assistant-changed-files-tree'
import { ChatDiffStatLabel } from './chat-diff-stat-label'

export function AssistantChangedFilesSection({
  summary,
  onOpenDiff,
}: {
  summary: ChatTurnDiffSummary
  onOpenDiff?: (summary: ChatTurnDiffSummary, path?: string) => Promise<unknown> | unknown
}) {
  const [allDirectoriesExpanded, setAllDirectoriesExpanded] = useState(true)
  const [diffError, setDiffError] = useState<string | null>(null)
  const files = summary.files
  if (files.length === 0) return null

  const summaryStat = summarizeChatTurnDiffStats(files)
  const checkpointDiffAvailable = Boolean(onOpenDiff) && canOpenCheckpointDiff(summary)

  async function handleOpenCheckpointDiff(path?: string) {
    if (!checkpointDiffAvailable) return

    setDiffError(null)
    try {
      await onOpenDiff?.(summary, path)
    } catch (error) {
      setDiffError(checkpointDiffErrorMessage(error))
    }
  }

  return (
    <section className='border-border/80 bg-card/45 mt-2 rounded-lg border p-2.5'>
      <div className='mb-1.5 flex items-center justify-between gap-2'>
        <p className='text-muted-foreground/65 text-[10px] tracking-[0.12em] uppercase'>
          <span>Changed files ({files.length})</span>
          {hasNonZeroChatTurnDiffStat(summaryStat) ? (
            <>
              <span className='mx-1'>•</span>
              <ChatDiffStatLabel
                additions={summaryStat.additions}
                deletions={summaryStat.deletions}
              />
            </>
          ) : null}
        </p>
        <div className='flex shrink-0 items-center gap-1.5'>
          {checkpointDiffAvailable ? (
            <button
              className='border-border bg-background hover:bg-muted hover:text-foreground h-6 border px-2 text-xs font-medium transition-colors'
              data-scroll-anchor-ignore
              type='button'
              onClick={() => void handleOpenCheckpointDiff()}
            >
              View diff
            </button>
          ) : (
            <span className='text-muted-foreground/55 text-[10px]'>
              {checkpointStatusLabel(summary.status)}
            </span>
          )}
          <button
            className='border-border bg-background hover:bg-muted hover:text-foreground h-6 border px-2 text-xs font-medium transition-colors'
            data-scroll-anchor-ignore
            type='button'
            onClick={() => setAllDirectoriesExpanded((value) => !value)}
          >
            {allDirectoriesExpanded ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      </div>
      <AssistantChangedFilesTree
        allDirectoriesExpanded={allDirectoriesExpanded}
        files={files}
        key={`changed-files-tree:${summary.turnId}`}
        onOpenFileDiff={checkpointDiffAvailable ? handleOpenCheckpointDiff : undefined}
      />
      {diffError ? <p className='text-destructive mt-1.5 text-[11px]'>{diffError}</p> : null}
    </section>
  )
}

function checkpointStatusLabel(status: ChatTurnDiffSummary['status']) {
  if (status === 'missing') return 'Checkpoint missing'
  if (status === 'error') return 'Checkpoint error'

  return 'Diff unavailable'
}

function checkpointDiffErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  return 'Checkpoint diff unavailable.'
}
