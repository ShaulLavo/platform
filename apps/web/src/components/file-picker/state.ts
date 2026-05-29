import type { FsEntry, PickedFsEntry, ServerInfo } from '@/lib/file-system-types'
import { useEffect, useRef, useState } from 'react'

import { ROOT_PATH, initialPathForOpen } from './model'

export function useFilePickerSession(value: PickedFsEntry | null) {
  const initializedOpenRef = useRef(false)
  const [currentPath, setCurrentPath] = useState(ROOT_PATH)
  const [history, setHistory] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 180)
  const effectiveQuery = query.trim() ? debouncedQuery : ''
  const [selectedEntry, setSelectedEntry] = useState<FsEntry | null>(value)

  function initializeOpenSession(info: ServerInfo) {
    if (initializedOpenRef.current) return

    initializedOpenRef.current = true
    setHistory([])
    setQuery('')
    setSelectedEntry(value)
    setCurrentPath(initialPathForOpen(value, info.defaultPath ?? info.homePath))
  }

  function resetOpenSession() {
    initializedOpenRef.current = false
  }

  function navigateTo(path: string) {
    if (path === currentPath) return

    moveToPath(path, true)
  }

  function jumpTo(path: string) {
    if (path === currentPath) return

    moveToPath(path, true)
  }

  function goBack() {
    const previous = history.at(-1)
    if (previous === undefined) return

    setHistory((items) => items.slice(0, -1))
    setCurrentPath(previous)
    setSelectedEntry(null)
    setQuery('')
  }

  function moveToPath(path: string, keepHistory: boolean) {
    if (keepHistory) setHistory((items) => items.concat(currentPath))
    setCurrentPath(path)
    setSelectedEntry(null)
    setQuery('')
  }

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

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [delay, value])

  return debounced
}
