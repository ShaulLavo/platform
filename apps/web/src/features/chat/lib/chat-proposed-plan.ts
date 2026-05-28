const PROPOSED_PLAN_COLLAPSE_LENGTH = 900
const PROPOSED_PLAN_COLLAPSE_LINES = 20
const PROPOSED_PLAN_PREVIEW_LINES = 10

export function proposedPlanTitle(planMarkdown: string) {
  const heading = planMarkdown.match(/^\s{0,3}#{1,6}\s+(.+)$/m)?.[1]?.trim()
  if (heading) return heading

  return 'Proposed plan'
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
