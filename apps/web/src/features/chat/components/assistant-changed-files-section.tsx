import { useState } from 'react'

import { hasNonZeroChatTurnDiffStat, summarizeChatTurnDiffStats } from '../lib/chat-turn-diff-tree'
import type { ChatTurnDiffSummary } from '../state/chat-projection-store'
import { AssistantChangedFilesTree } from './assistant-changed-files-tree'
import { ChatDiffStatLabel } from './chat-diff-stat-label'

export function AssistantChangedFilesSection({ summary }: { summary: ChatTurnDiffSummary }) {
  const [allDirectoriesExpanded, setAllDirectoriesExpanded] = useState(true)
  const files = summary.files
  if (files.length === 0) return null

  const summaryStat = summarizeChatTurnDiffStats(files)

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
        <button
          className='border-border bg-background hover:bg-muted hover:text-foreground h-6 shrink-0 border px-2 text-xs font-medium transition-colors'
          data-scroll-anchor-ignore
          type='button'
          onClick={() => setAllDirectoriesExpanded((value) => !value)}
        >
          {allDirectoriesExpanded ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <AssistantChangedFilesTree
        allDirectoriesExpanded={allDirectoriesExpanded}
        files={files}
        key={`changed-files-tree:${summary.turnId}`}
      />
    </section>
  )
}
