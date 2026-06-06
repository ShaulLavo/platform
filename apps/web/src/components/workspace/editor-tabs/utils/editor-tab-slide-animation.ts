const MIN_SLIDE_DELTA_PX = 0.5

export type ChromeTabSlideSnapshot = {
  readonly tabs: readonly ChromeTabSlideSnapshotTab[]
}

type ChromeTabSlideSnapshotTab = {
  readonly id: string
  readonly left: number
}

type ChromeTabSlideAnimation = {
  readonly element: HTMLElement
  readonly transform: string
  readonly transition: string
}

export function chromeTabSlideSnapshot(rootElement: HTMLElement | null): ChromeTabSlideSnapshot {
  if (rootElement === null) return { tabs: [] }

  return {
    tabs: chromeTabElements(rootElement).map((element) => ({
      id: element.dataset.editorTabId ?? '',
      left: element.getBoundingClientRect().left,
    })),
  }
}

export function animateChromeTabSlides(
  rootElement: HTMLElement | null,
  previous: ChromeTabSlideSnapshot | null,
  current: ChromeTabSlideSnapshot,
) {
  if (rootElement === null) return noop
  if (previous === null) return noop

  const previousTabsById = new Map(previous.tabs.map((tab) => [tab.id, tab]))
  const elementsById = new Map(
    chromeTabElements(rootElement).map((element) => [tabId(element), element]),
  )
  const animations = slideAnimations(previousTabsById, elementsById, current)
  if (animations.length === 0) return noop

  for (const animation of animations) {
    animation.element.style.transition = 'none'
    animation.element.style.transform = animation.transform
  }

  let started = false
  const frame = requestAnimationFrame(() => {
    started = true

    for (const animation of animations) {
      animation.element.style.transition = animation.transition
      animation.element.style.transform = ''
    }
  })

  return () => {
    cancelAnimationFrame(frame)
    if (started) return

    for (const animation of animations) {
      animation.element.style.transition = animation.transition
      animation.element.style.transform = ''
    }
  }
}

function slideAnimations(
  previousTabsById: ReadonlyMap<string, ChromeTabSlideSnapshotTab>,
  elementsById: ReadonlyMap<string, HTMLElement>,
  current: ChromeTabSlideSnapshot,
) {
  const animations: ChromeTabSlideAnimation[] = []

  for (const tab of current.tabs) {
    const previousTab = previousTabsById.get(tab.id)
    if (!previousTab) continue

    const deltaX = previousTab.left - tab.left
    if (Math.abs(deltaX) < MIN_SLIDE_DELTA_PX) continue

    const element = elementsById.get(tab.id)
    if (!element) continue

    animations.push({
      element,
      transform: `translateX(${Math.round(deltaX)}px)`,
      transition: element.style.transition,
    })
  }

  return animations
}

function chromeTabElements(rootElement: HTMLElement) {
  return Array.from(rootElement.querySelectorAll<HTMLElement>('[data-editor-tab-id]')).filter(
    (element) => tabId(element) !== '',
  )
}

function tabId(element: HTMLElement) {
  return element.dataset.editorTabId ?? ''
}

function noop() {
  return undefined
}
