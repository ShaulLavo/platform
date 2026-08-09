/**
 * A pasted stack trace or spec should not own the timeline: past these bounds a
 * user message renders clipped behind a "Show full message" toggle.
 */
const MAX_COLLAPSED_LINES = 8
const MAX_COLLAPSED_CHARACTERS = 600

export function shouldCollapseUserMessage(text: string) {
  if (text.trim().length === 0) return false
  if (text.length > MAX_COLLAPSED_CHARACTERS) return true

  return text.split('\n').length > MAX_COLLAPSED_LINES
}
