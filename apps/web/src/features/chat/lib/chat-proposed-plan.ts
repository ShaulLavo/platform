import type { InteractionMode, OrchestrationProposedPlan } from '@workspace/contracts'

import { threadTitleFromPrompt } from '@/features/chat/lib/chat-command-builders'

const PROPOSED_PLAN_COLLAPSE_LENGTH = 900
const PROPOSED_PLAN_COLLAPSE_LINES = 20
const PROPOSED_PLAN_PREVIEW_LINES = 10
const PROPOSED_PLAN_IMPLEMENTATION_HEADER = 'PLEASE IMPLEMENT THIS PLAN:'
const PLAN_IMPLEMENTATION_THREAD_TITLE = 'Implement plan'

/**
 * What the composer does next once a plan is on screen. An empty composer means
 * the user read the plan and had nothing to add, which is the whole point of
 * plan mode: the next turn implements it. Any typed text is feedback, so the
 * next turn stays in plan mode and produces a revised plan instead.
 */
export type PlanFollowUpSubmission = {
  readonly interactionMode: InteractionMode
  /**
   * Only an implementation turn is worth correlating back to the plan — a
   * refinement produces a new plan rather than acting on this one.
   */
  readonly implementsPlan: boolean
  readonly text: string
}

export function proposedPlanTitle(planMarkdown: string) {
  return planHeading(planMarkdown) ?? 'Proposed plan'
}

export function stripDisplayedPlanMarkdown(planMarkdown: string) {
  const sourceLines = planMarkdown.trimEnd().split(/\r?\n/)
  const lines =
    sourceLines[0] && /^\s{0,3}#{1,6}\s+/.test(sourceLines[0])
      ? sourceLines.slice(1)
      : [...sourceLines]

  removeBlankPrefix(lines)
  if (summaryHeading(lines[0])) {
    lines.shift()
    removeBlankPrefix(lines)
  }

  return lines.join('\n')
}

export function canCollapseProposedPlan(planMarkdown: string) {
  return (
    planMarkdown.length > PROPOSED_PLAN_COLLAPSE_LENGTH ||
    planMarkdown.split('\n').length > PROPOSED_PLAN_COLLAPSE_LINES
  )
}

export function collapsedProposedPlanMarkdown(planMarkdown: string) {
  const lines = stripDisplayedPlanMarkdown(planMarkdown)
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
  const previewLines: string[] = []
  let visibleLineCount = 0
  let hasMoreContent = false

  for (const line of lines) {
    const isVisibleLine = line.trim().length > 0
    if (isVisibleLine && visibleLineCount >= PROPOSED_PLAN_PREVIEW_LINES) {
      hasMoreContent = true
      break
    }
    previewLines.push(line)
    if (isVisibleLine) visibleLineCount += 1
  }

  removeBlankSuffix(previewLines)
  if (previewLines.length === 0) return proposedPlanTitle(planMarkdown)
  if (hasMoreContent) previewLines.push('', '...')

  return previewLines.join('\n')
}

/**
 * The one plan a thread can still act on: the newest one nothing has been built
 * from yet. `implementedAt` is the server's stamp, so a plan stops being
 * actionable the moment its implementation turn starts — not when this client
 * happens to guess it did.
 */
export function actionableProposedPlan(plans: readonly OrchestrationProposedPlan[]) {
  let actionable: OrchestrationProposedPlan | null = null

  for (const plan of plans) {
    if (plan.implementedAt) continue
    if (actionable && actionable.updatedAt > plan.updatedAt) continue

    actionable = plan
  }

  return actionable
}

export function planImplementationPrompt(planMarkdown: string) {
  return `${PROPOSED_PLAN_IMPLEMENTATION_HEADER}\n${planMarkdown.trim()}`
}

/**
 * What the rail calls a thread that was split off to build a plan. Naming it
 * after the prompt's first line — which every thread does — would name all of
 * them after the implementation header, so the plan's own heading stands in. It
 * still goes through the shared cleaner, so a heading cannot name a thread
 * anything a typed prompt could not.
 */
export function planImplementationThreadTitle(planMarkdown: string) {
  const heading = planHeading(planMarkdown)
  if (!heading) return PLAN_IMPLEMENTATION_THREAD_TITLE

  return threadTitleFromPrompt(`Implement ${heading}`) ?? PLAN_IMPLEMENTATION_THREAD_TITLE
}

/**
 * The bootstrap turn that builds a plan somewhere other than where it was
 * written. The draft builder knows nothing about plans — it names the thread
 * after the prompt and leaves the correlation empty — so the title and the
 * pointer back to the plan are stamped on here. Thread and turn ride one
 * command, so a rejected dispatch leaves no half-created thread behind.
 */
export function resolvePlanFollowUpSubmission({
  draftText,
  planMarkdown,
}: {
  draftText: string
  planMarkdown: string
}): PlanFollowUpSubmission {
  const feedback = draftText.trim()
  if (feedback) {
    return {
      implementsPlan: false,
      interactionMode: 'plan',
      text: feedback,
    }
  }

  return {
    implementsPlan: true,
    interactionMode: 'default',
    text: planImplementationPrompt(planMarkdown),
  }
}

/** Markdown files end in a newline; the stored plan is trimmed. */
export function proposedPlanExportMarkdown(planMarkdown: string) {
  return `${planMarkdown.trimEnd()}\n`
}

export function proposedPlanExportFilename(planMarkdown: string) {
  const slug = proposedPlanTitle(planMarkdown)
    .toLowerCase()
    .replaceAll(/[`'".,!?()[\]{}]+/g, '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')

  return `${slug || 'plan'}.md`
}

/** A heading of nothing but whitespace is no heading, so callers see one fallback. */
function planHeading(planMarkdown: string) {
  return planMarkdown.match(/^\s{0,3}#{1,6}\s+(.+)$/m)?.[1]?.trim() || undefined
}

function removeBlankPrefix(lines: string[]) {
  while (lines[0]?.trim().length === 0) {
    lines.shift()
  }
}

function removeBlankSuffix(lines: string[]) {
  while (lines.length > 0 && lines.at(-1)?.trim().length === 0) {
    lines.pop()
  }
}

function summaryHeading(line: string | undefined) {
  const match = line?.match(/^\s{0,3}#{1,6}\s+(.+)$/)

  return match?.[1]?.trim().toLowerCase() === 'summary'
}
