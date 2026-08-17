import type { OrchestrationLatestTurn, OrchestrationThreadActivity } from '@workspace/contracts'

import {
  chatActivityPlanSteps,
  chatActivityPresentation,
  chatActivityToolCallId,
  type ChatActivityIconKey,
  type ChatActivityOutcome,
  type ChatActivityPlanStep,
} from '@/features/chat/utils/activity-presentation'

export type ChatWorkLogTone = 'error' | 'info' | 'thinking' | 'tool'

export type ChatWorkLogPlan = {
  completedCount: number
  currentStep: string | null
  steps: readonly ChatActivityPlanStep[]
}

export type ChatWorkLogEntry = {
  changedFiles: readonly string[]
  command: string | null
  createdAt: string
  detail: string | null
  icon: ChatActivityIconKey
  id: string
  itemType: string | null
  outcome: ChatActivityOutcome | null
  output: string | null
  plan: ChatWorkLogPlan | null
  status: string | null
  title: string
  tone: ChatWorkLogTone
  turnId: OrchestrationThreadActivity['turnId']
}

type DerivedChatWorkLogEntry = ChatWorkLogEntry & {
  activityKind: string
  collapseKey: string | null
  toolCallKey: string | null
}

type TurnPlanRow = {
  anchorId: string
  createdAt: string
  entry: DerivedChatWorkLogEntry
}

/** Every field of `ChatWorkLogEntry` that compares by `===`; the rest are handled by hand. */
const WORK_LOG_SCALAR_FIELDS = [
  'command',
  'createdAt',
  'detail',
  'icon',
  'id',
  'itemType',
  'outcome',
  'output',
  'status',
  'title',
  'tone',
  'turnId',
] as const satisfies readonly (keyof ChatWorkLogEntry)[]

/**
 * Every turn's work is derived, not just the running one: scrolling back through a
 * finished thread must still show the tool calls, reasoning and approvals that produced it.
 *
 * The caller passes the store's order — `(sequence, createdAt, id)`, established
 * once in `chat-projection-writers.ts`. Re-sorting here by `createdAt` alone used
 * to be able to contradict it, so the rows and the transcript disagreed. The store
 * is the authority; do not re-establish the order.
 */
export function chatWorkLogEntries({
  activities,
}: {
  activities: readonly OrchestrationThreadActivity[]
}) {
  const planRows = turnPlanRows(activities)
  const entries: DerivedChatWorkLogEntry[] = []

  for (const activity of activities) {
    if (activity.kind === 'turn.plan.updated') {
      appendTurnPlanRow(entries, planRows, activity)
      continue
    }
    if (!isActivityForWorkLog(activity)) continue

    entries.push(derivedWorkLogEntry(activity))
  }

  return collapseWorkLogEntries(entries).map(
    ({
      activityKind: _activityKind,
      collapseKey: _collapseKey,
      toolCallKey: _toolCallKey,
      ...entry
    }) => entry,
  )
}

/** The plan the working row narrates: this turn's, falling back to the thread's most recent. */
export function chatActiveWorkLogPlan(
  entries: readonly ChatWorkLogEntry[],
  latestTurnId: OrchestrationLatestTurn['turnId'] | null | undefined,
) {
  const planEntries = entries.filter((entry) => entry.plan !== null)
  const turnPlan = latestTurnId
    ? planEntries.findLast((entry) => entry.turnId === latestTurnId)
    : undefined

  return (turnPlan ?? planEntries.at(-1))?.plan ?? null
}

/**
 * Value equality, because every projection tick re-derives fresh entry objects — an
 * identity check would report "changed" on every streaming delta and defeat the
 * structural sharing the timeline rows depend on.
 */
export function chatWorkLogEntryEquals(left: ChatWorkLogEntry, right: ChatWorkLogEntry) {
  if (left === right) return true

  const scalarsMatch = WORK_LOG_SCALAR_FIELDS.every((field) => left[field] === right[field])
  if (!scalarsMatch) return false
  if (!stringListsEqual(left.changedFiles, right.changedFiles)) return false

  return chatWorkLogPlanEquals(left.plan, right.plan)
}

export function chatWorkLogPlanEquals(left: ChatWorkLogPlan | null, right: ChatWorkLogPlan | null) {
  if (left === right) return true
  if (!left || !right) return false
  if (left.completedCount !== right.completedCount) return false
  if (left.currentStep !== right.currentStep) return false
  if (left.steps.length !== right.steps.length) return false

  return left.steps.every((step, index) => planStepEquals(step, right.steps[index]))
}

function planStepEquals(left: ChatActivityPlanStep, right: ChatActivityPlanStep | undefined) {
  return left.status === right?.status && left.step === right.step
}

function stringListsEqual(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false

  return left.every((value, index) => value === right[index])
}

function isActivityForWorkLog(activity: OrchestrationThreadActivity) {
  if (activity.kind === 'task.started') return false
  if (activity.kind === 'context-window.updated') return false
  if (activity.summary === 'Checkpoint captured') return false
  if (isPlanBoundaryToolActivity(activity)) return false
  // A start with no tool-call id cannot fold into its completion, so it would
  // duplicate the row it belongs to.
  if (activity.kind === 'tool.started') return chatActivityToolCallId(activity) !== null

  return true
}

function isPlanBoundaryToolActivity(activity: OrchestrationThreadActivity) {
  if (!activity.kind.startsWith('tool.')) return false

  const detail = stringPayloadValue(activity.payload, 'detail')
  return Boolean(detail?.startsWith('ExitPlanMode:'))
}

/**
 * Plans rewrite themselves on every step, so one row per turn holds the latest snapshot
 * anchored where planning began — a row per snapshot would bury the rest of the log.
 */
function turnPlanRows(ordered: readonly OrchestrationThreadActivity[]) {
  const rows = new Map<string, TurnPlanRow>()

  for (const activity of ordered) {
    if (activity.kind !== 'turn.plan.updated') continue

    const key = turnPlanKey(activity)
    const plan = workLogPlan(activity)
    // A later snapshot with no steps withdraws the plan; keeping the stale row would
    // freeze the timeline on a plan the model already abandoned.
    if (!plan) {
      rows.delete(key)
      continue
    }

    const existing = rows.get(key)
    const createdAt = existing?.createdAt ?? activity.createdAt
    rows.set(key, {
      anchorId: existing?.anchorId ?? activity.id,
      createdAt,
      entry: planWorkLogEntry(activity, key, createdAt, plan),
    })
  }

  return rows
}

function appendTurnPlanRow(
  entries: DerivedChatWorkLogEntry[],
  planRows: ReadonlyMap<string, TurnPlanRow>,
  activity: OrchestrationThreadActivity,
) {
  const row = planRows.get(turnPlanKey(activity))
  if (!row) return
  if (row.anchorId !== activity.id) return

  entries.push(row.entry)
}

function turnPlanKey(activity: OrchestrationThreadActivity) {
  return activity.turnId ?? 'no-turn'
}

function workLogPlan(activity: OrchestrationThreadActivity): ChatWorkLogPlan | null {
  const steps = chatActivityPlanSteps(activity)
  if (steps.length === 0) return null

  return {
    completedCount: steps.filter((step) => step.status === 'completed').length,
    currentStep: currentPlanStep(steps),
    steps,
  }
}

function currentPlanStep(steps: readonly ChatActivityPlanStep[]) {
  const inProgress = steps.find((step) => step.status === 'inProgress')
  if (inProgress) return inProgress.step

  return steps.find((step) => step.status === 'pending')?.step ?? null
}

function planWorkLogEntry(
  activity: OrchestrationThreadActivity,
  key: string,
  createdAt: string,
  plan: ChatWorkLogPlan,
): DerivedChatWorkLogEntry {
  return {
    activityKind: activity.kind,
    changedFiles: [],
    collapseKey: null,
    command: null,
    createdAt,
    detail: null,
    icon: 'task',
    id: `turn-plan:${key}`,
    itemType: null,
    outcome: null,
    output: null,
    plan,
    status: null,
    title: activity.summary || 'Plan updated',
    toolCallKey: null,
    tone: 'info',
    turnId: activity.turnId,
  }
}

function derivedWorkLogEntry(activity: OrchestrationThreadActivity): DerivedChatWorkLogEntry {
  const presentation = chatActivityPresentation(activity)
  const entry = {
    activityKind: activity.kind,
    changedFiles: presentation.changedFiles,
    collapseKey: null,
    command: presentation.command,
    createdAt: activity.createdAt,
    detail: presentation.detail,
    icon: presentation.icon,
    id: activity.id,
    itemType: stringPayloadValue(activity.payload, 'itemType'),
    outcome: presentation.outcome,
    output: presentation.output,
    plan: null,
    status: presentation.status,
    title: presentation.title,
    toolCallKey: toolCallKey(activity, presentation.toolCallId),
    tone: workLogTone(activity),
    turnId: activity.turnId,
  }

  return {
    ...entry,
    collapseKey: workLogCollapseKey(entry),
  }
}

function toolCallKey(activity: OrchestrationThreadActivity, toolCallId: string | null) {
  if (!toolCallId) return null
  if (!activity.kind.startsWith('tool.')) return null

  return [activity.turnId ?? 'no-turn', toolCallId].join('')
}

function workLogTone(activity: OrchestrationThreadActivity): ChatWorkLogTone {
  if (activity.kind === 'task.progress') return 'thinking'
  if (activity.tone === 'approval') return 'info'
  if (activity.tone === 'error') return 'error'
  if (activity.tone === 'thinking') return 'thinking'
  if (activity.tone === 'tool') return 'tool'

  return 'info'
}

/**
 * Two folds, deliberately different: a provider tool-call id folds the whole lifecycle
 * into the row where the call started, while the text key only ever merges neighbours —
 * running the same command twice must stay two rows.
 */
function collapseWorkLogEntries(entries: readonly DerivedChatWorkLogEntry[]) {
  const collapsed: DerivedChatWorkLogEntry[] = []
  const indexByToolCallKey = new Map<string, number>()

  for (const entry of entries) {
    const foldIndex = entry.toolCallKey ? indexByToolCallKey.get(entry.toolCallKey) : undefined
    if (foldIndex !== undefined) {
      collapsed[foldIndex] = mergeWorkLogEntries(collapsed[foldIndex]!, entry)
      continue
    }
    const previous = collapsed.at(-1)
    if (previous && shouldCollapseWorkLogEntries(previous, entry)) {
      collapsed[collapsed.length - 1] = mergeWorkLogEntries(previous, entry)
      continue
    }
    if (entry.toolCallKey) {
      indexByToolCallKey.set(entry.toolCallKey, collapsed.length)
    }
    collapsed.push(entry)
  }

  return collapsed
}

function shouldCollapseWorkLogEntries(
  previous: DerivedChatWorkLogEntry,
  next: DerivedChatWorkLogEntry,
) {
  if (previous.turnId !== next.turnId) return false
  if (!isCollapsibleToolLifecycleKind(previous.activityKind)) return false
  if (!isCollapsibleToolLifecycleKind(next.activityKind)) return false
  if (previous.activityKind === 'tool.completed') return false
  if (!previous.collapseKey || !next.collapseKey) return false

  return previous.collapseKey === next.collapseKey
}

function isCollapsibleToolLifecycleKind(kind: string) {
  return kind === 'tool.updated' || kind === 'tool.completed'
}

/** The surviving row keeps the first event's id and timestamp so it never moves or remounts. */
function mergeWorkLogEntries(
  previous: DerivedChatWorkLogEntry,
  next: DerivedChatWorkLogEntry,
): DerivedChatWorkLogEntry {
  return {
    ...previous,
    ...next,
    changedFiles: next.changedFiles.length > 0 ? next.changedFiles : previous.changedFiles,
    command: next.command ?? previous.command,
    createdAt: previous.createdAt,
    detail: next.detail ?? previous.detail,
    id: previous.id,
    itemType: next.itemType ?? previous.itemType,
    outcome: mergedOutcome(previous.outcome, next.outcome),
    output: next.output ?? previous.output,
    status: next.status ?? previous.status,
    title: next.title || previous.title,
  }
}

function mergedOutcome(
  previous: ChatActivityOutcome | null,
  next: ChatActivityOutcome | null,
): ChatActivityOutcome | null {
  if (previous === 'failed' || next === 'failed') return 'failed'

  return next ?? previous
}

function workLogCollapseKey(entry: Omit<DerivedChatWorkLogEntry, 'collapseKey'>) {
  if (!isCollapsibleToolLifecycleKind(entry.activityKind)) return null

  const title = compactActivityLabel(entry.title)
  const detail = entry.detail?.trim() ?? ''
  const itemType = entry.itemType ?? ''
  if (!title && !detail && !itemType) return null

  return [itemType, title, detail].join('')
}

function stringPayloadValue(payload: unknown, key: string) {
  if (!payload || typeof payload !== 'object') return null
  if (Array.isArray(payload)) return null

  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function compactActivityLabel(value: string) {
  return value.replace(/\s+(?:started|updated|complete|completed)\s*$/i, '').trim()
}
