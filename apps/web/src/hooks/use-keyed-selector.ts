import { useCallback, useRef, useSyncExternalStore } from 'react'

type Listener = () => void

type SingleKeyedSelector<T> = {
  (key: T): boolean
  multiple: false
  set: (key: T | undefined) => void
  select: (key: T) => void
  clear: () => void
  get: () => T | undefined
}

type MultiKeyedSelector<T> = {
  (key: T): boolean
  multiple: true
  set: (keys: Iterable<T>) => void
  select: (key: T) => void
  unselect: (key: T) => void
  toggle: (key: T) => void
  clear: () => void
  get: () => ReadonlySet<T>
}

export function useKeyedSelector<T>(options?: {
  multiple?: false
  initial?: T
}): SingleKeyedSelector<T>

export function useKeyedSelector<T>(options: {
  multiple: true
  initial?: Iterable<T>
}): MultiKeyedSelector<T>

export function useKeyedSelector<T>(options?: { multiple?: boolean; initial?: T | Iterable<T> }) {
  const selectorRef = useRef<SingleKeyedSelector<T> | MultiKeyedSelector<T>>()

  if (!selectorRef.current) {
    selectorRef.current = createKeyedSelector<T>(options)
  }

  return selectorRef.current
}

function createKeyedSelector<T>(options?: {
  multiple?: boolean
  initial?: T | Iterable<T>
}): SingleKeyedSelector<T> | MultiKeyedSelector<T> {
  const multiple = options?.multiple === true

  let selected: T | undefined = multiple ? undefined : (options?.initial as T | undefined)

  let selectedSet = multiple ? new Set(options?.initial as Iterable<T> | undefined) : new Set<T>()

  const listenersByKey = new Map<T, Set<Listener>>()

  function subscribe(key: T, listener: Listener) {
    let listeners = listenersByKey.get(key)

    if (!listeners) {
      listeners = new Set()
      listenersByKey.set(key, listeners)
    }

    listeners.add(listener)

    return () => {
      listeners!.delete(listener)

      if (listeners!.size === 0) {
        listenersByKey.delete(key)
      }
    }
  }

  function notify(key: T | undefined) {
    if (key === undefined) return

    listenersByKey.get(key)?.forEach((listener) => {
      listener()
    })
  }

  const selector = ((key: T) => {
    const subscribeToKey = useCallback((listener: Listener) => subscribe(key, listener), [key])

    const getSnapshot = useCallback(() => {
      return multiple ? selectedSet.has(key) : Object.is(selected, key)
    }, [key])

    return useSyncExternalStore(subscribeToKey, getSnapshot, () => false)
  }) as SingleKeyedSelector<T> | MultiKeyedSelector<T>

  if (!multiple) {
    const single = selector as SingleKeyedSelector<T>

    single.multiple = false

    single.set = (next) => {
      const prev = selected

      if (Object.is(prev, next)) return

      selected = next

      // only old + new keys wake up
      notify(prev)
      notify(next)
    }

    single.select = (key) => {
      single.set(key)
    }

    single.clear = () => {
      single.set(undefined)
    }

    single.get = () => selected

    return single
  }

  const multi = selector as MultiKeyedSelector<T>

  multi.multiple = true

  multi.set = (keys) => {
    const prevSet = selectedSet
    const nextSet = new Set(keys)

    selectedSet = nextSet

    // only changed keys wake up
    for (const key of prevSet) {
      if (!nextSet.has(key)) notify(key)
    }

    for (const key of nextSet) {
      if (!prevSet.has(key)) notify(key)
    }
  }

  multi.select = (key) => {
    if (selectedSet.has(key)) return

    selectedSet = new Set(selectedSet)
    selectedSet.add(key)

    notify(key)
  }

  multi.unselect = (key) => {
    if (!selectedSet.has(key)) return

    selectedSet = new Set(selectedSet)
    selectedSet.delete(key)

    notify(key)
  }

  multi.toggle = (key) => {
    if (selectedSet.has(key)) {
      multi.unselect(key)
    } else {
      multi.select(key)
    }
  }

  multi.clear = () => {
    multi.set([])
  }

  multi.get = () => selectedSet

  return multi
}
