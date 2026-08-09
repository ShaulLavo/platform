import { WarningCircleIcon } from '@phosphor-icons/react'

import { PendingApprovalActions } from '@/features/chat/components/pending-approval-actions'
import { usePendingRequests } from '@/features/chat/hooks/use-pending-requests'
import type { PendingApprovalKind } from '@/features/chat/utils/pending-approvals'

/**
 * The open approvals, directly above the composer. Every one of them is holding
 * the agent mid-turn, so they all render rather than queueing behind each
 * other, and the whole block is an assertive live region.
 */
export function PendingApprovalPanel() {
  const { pendingApprovals } = usePendingRequests()
  if (pendingApprovals.length === 0) return null

  return (
    <div aria-label='Pending approvals' className='shrink-0 px-3 pb-2' role='alert'>
      <div className='mx-auto flex max-w-3xl flex-col gap-2'>
        {pendingApprovals.map((approval, index) => (
          <section
            aria-label={approvalTitle(approval.requestKind)}
            className='border-warning/30 bg-warning/10 flex flex-col gap-2 border p-3'
            key={approval.requestId}
          >
            <div className='flex flex-wrap items-center gap-2'>
              <WarningCircleIcon className='text-warning size-4' />
              <span className='text-warning text-[11px] font-semibold tracking-widest uppercase'>
                Approval needed
              </span>
              <span className='text-foreground text-xs font-medium'>
                {approvalTitle(approval.requestKind)}
              </span>
              {approval.requestKind ? null : (
                <span className='text-muted-foreground font-mono text-[10px]'>
                  {approval.requestType ?? 'unknown request'}
                </span>
              )}
              {pendingApprovals.length > 1 ? (
                <span className='text-muted-foreground text-[10px] tabular-nums'>
                  {index + 1}/{pendingApprovals.length}
                </span>
              ) : null}
            </div>
            {approval.detail ? (
              <div className='border-border bg-background border p-2'>
                <p className='text-muted-foreground text-[11px] font-medium'>
                  {detailLabel(approval.requestKind)}
                </p>
                <pre
                  aria-label={detailLabel(approval.requestKind)}
                  className='text-foreground mt-1 max-h-40 overflow-auto font-mono text-xs leading-relaxed break-words whitespace-pre-wrap'
                >
                  {approval.detail}
                </pre>
              </div>
            ) : null}
            <PendingApprovalActions requestId={approval.requestId} />
          </section>
        ))}
      </div>
    </div>
  )
}

function approvalTitle(requestKind: PendingApprovalKind | null) {
  if (requestKind === 'command') return 'Run a command'
  if (requestKind === 'file-change') return 'Apply a file change'
  if (requestKind === 'file-read') return 'Read a file'

  return 'Approval requested'
}

function detailLabel(requestKind: PendingApprovalKind | null) {
  if (requestKind === 'command') return 'Command'
  if (requestKind === 'file-change') return 'File change'
  if (requestKind === 'file-read') return 'File to read'

  return 'Details'
}
