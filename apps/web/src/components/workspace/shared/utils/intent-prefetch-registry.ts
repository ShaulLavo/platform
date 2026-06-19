import { ForesightManager, type HitSlop } from 'js.foresight'

export type IntentPrefetchRow<TIntent> = {
  intent: TIntent
  key: string
  meta: Record<string, unknown>
  name: string
}

export type IntentPrefetchRegistryConfig<TIntent> = {
  hitSlop?: HitSlop
  reactivateAfter: number
  resolveRow: (element: HTMLElement) => IntentPrefetchRow<TIntent> | null
}

export type IntentPrefetchRegistry<TIntent> = {
  clear: () => void
  sync: (elements: Iterable<HTMLElement>, onIntent: (intent: TIntent) => void) => void
}

export function createIntentPrefetchRegistry<TIntent>({
  hitSlop,
  reactivateAfter,
  resolveRow,
}: IntentPrefetchRegistryConfig<TIntent>): IntentPrefetchRegistry<TIntent> {
  const registrations = new Map<HTMLElement, string>()

  function sync(elements: Iterable<HTMLElement>, onIntent: (intent: TIntent) => void) {
    const currentElements = new Set(elements)

    for (const element of registrations.keys()) {
      if (currentElements.has(element)) continue

      unregister(element)
    }

    for (const element of currentElements) {
      register(element, onIntent)
    }
  }

  function register(element: HTMLElement, onIntent: (intent: TIntent) => void) {
    const row = resolveRow(element)
    if (!row) {
      unregister(element)
      return
    }

    const currentKey = registrations.get(element)
    if (currentKey === row.key) return
    if (currentKey) unregister(element)

    ForesightManager.instance.register({
      callback: () => onIntent(row.intent),
      element,
      hitSlop,
      meta: row.meta,
      name: row.name,
      reactivateAfter,
    })
    registrations.set(element, row.key)
  }

  function unregister(element: HTMLElement) {
    registrations.delete(element)
    if (!ForesightManager.isInitiated) return

    ForesightManager.instance.unregister(element)
  }

  function clear() {
    for (const element of registrations.keys()) {
      unregister(element)
    }
  }

  return { clear, sync }
}
