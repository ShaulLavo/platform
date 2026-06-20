export function isFocusOutsideElement(element: HTMLElement, target: EventTarget | null) {
  if (!(target instanceof Node)) return true

  return !element.contains(target)
}
