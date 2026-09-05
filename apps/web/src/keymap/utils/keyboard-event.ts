const NON_TEXT_INPUT_TYPES = new Set(['button', 'reset', 'submit'])

export function eventTargetsTextEntry(event: KeyboardEvent) {
  if (isTextEntryElement(document.activeElement)) return true
  if (isTextEntryElement(event.target)) return true

  return event.composedPath().some(isTextEntryElement)
}

function isTextEntryElement(target: EventTarget | null | undefined) {
  if (target instanceof HTMLInputElement)
    return !NON_TEXT_INPUT_TYPES.has(target.type.toLowerCase())
  if (target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLSelectElement) return true

  return target instanceof HTMLElement && target.isContentEditable
}
