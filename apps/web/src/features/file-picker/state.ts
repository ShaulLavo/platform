import type { FsEntry, PickedFsEntry, ServerInfo } from '@/lib/file-system-types'
import { useDebouncedValue } from '@tanstack/react-pacer/debouncer'
import { useCallback, useRef, useState } from 'react'

import { ROOT_PATH, initialPathForOpen } from '@/features/file-picker/model'

export function useFilePickerSession(value: PickedFsEntry | null) {
  const initializedOpenRef = useRef(false)
  const [currentPath, setCurrentPath] = useState(ROOT_PATH)
  const [history, setHistory] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [debouncedQuery] = useDebouncedValue(query, { wait: 180 })
  const effectiveQuery = query.trim() ? debouncedQuery : ''
  const [selectedEntry, setSelectedEntry] = useState<FsEntry | null>(value)

  const initializeOpenSession = useCallback(
    (info: ServerInfo) => {
      if (initializedOpenRef.current) return

      initializedOpenRef.current = true
      setHistory([])
      setQuery('')
      setSelectedEntry(value)
      setCurrentPath(initialPathForOpen(value, info.defaultPath ?? info.homePath))
    },
    [value],
  )

  const resetOpenSession = useCallback(() => {
    initializedOpenRef.current = false
  }, [])

  const moveToPath = useCallback(
    (path: string, keepHistory: boolean) => {
      if (keepHistory) setHistory((items) => items.concat(currentPath))
      setCurrentPath(path)
      setSelectedEntry(null)
      setQuery('')
    },
    [currentPath],
  )

  const navigateTo = useCallback(
    (path: string) => {
      if (path === currentPath) return

      moveToPath(path, true)
    },
    [currentPath, moveToPath],
  )

  const jumpTo = useCallback(
    (path: string) => {
      if (path === currentPath) return

      moveToPath(path, true)
    },
    [currentPath, moveToPath],
  )

  const goBack = useCallback(() => {
    const previous = history.at(-1)
    if (previous === undefined) return

    setHistory((items) => items.slice(0, -1))
    setCurrentPath(previous)
    setSelectedEntry(null)
    setQuery('')
  }, [history])

  return {
    canGoBack: history.length > 0,
    canGoUp: currentPath !== ROOT_PATH,
    currentPath,
    effectiveQuery,
    goBack,
    initializeOpenSession,
    jumpTo,
    navigateTo,
    query,
    resetOpenSession,
    selectedEntry,
    setQuery,
    setSelectedEntry,
  }
}
