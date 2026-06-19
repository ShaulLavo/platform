import type { ChatTimelineItem } from '../lib/chat-timeline-items'
import { ActivityGroupRow } from './activity-group-row'
import { AssistantMessageCopyButton } from './assistant-message-copy-button'
import { MessageBubble } from './message-bubble'
import { ProposedPlanCard } from './proposed-plan-card'
import { WorkingRow } from './working-row'

export function TimelineRow({
  checkpointRevertPending = false,
  item,
}: {
  checkpointRevertPending?: boolean
  item: ChatTimelineItem
}) {
  return (
    <div
      className='mx-auto w-full max-w-3xl min-w-0'
      data-timeline-row-id={item.id}
      data-timeline-row-type={item.type}
    >
      {timelineRowContent({
        checkpointRevertPending,
        item,
      })}
    </div>
  )
}

function timelineRowContent({
  checkpointRevertPending,
  item,
}: {
  checkpointRevertPending: boolean
  item: ChatTimelineItem
}) {
  if (item.type === 'message') {
    return (
      <MessageBubble
        assistantStreaming={item.assistantStreaming}
        assistantTurnInProgress={item.assistantTurnInProgress}
        checkpointRevertPending={checkpointRevertPending}
        completionSummary={item.completionSummary}
        durationEnd={item.durationEnd}
        durationStart={item.durationStart}
        message={item.message}
        renderAssistantCopyButton={renderAssistantCopyButton}
        revertTurnCount={item.revertTurnCount}
        showAssistantCopyButton={item.showAssistantCopyButton}
        showCompletionDivider={item.showCompletionDivider}
        turnDiffSummary={item.turnDiffSummary}
      />
    )
  }
  if (item.type === 'activity-group') return <ActivityGroupRow activities={item.activities} />
  if (item.type === 'proposed-plan') return <ProposedPlanCard plan={item.plan} />

  return <WorkingRow latestTurn={item.latestTurn} />
}

function renderAssistantCopyButton(text: string) {
  return <AssistantMessageCopyButton text={text} />
}
