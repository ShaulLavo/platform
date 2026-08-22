import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type { FileTreeRowDom } from './useFileTreeRowDom'
import { CONTEXT_MENU_SLOT_NAME, CONTEXT_MENU_TRIGGER_TYPE } from '../utils/constants'
import type { FileTreeController } from '../utils/model/FileTreeController'
import type { FileTreeLayoutStickyRow } from '../utils/model/layout'
import type {
  FileTreeCompositionOptions,
  FileTreeContextMenuButtonVisibility,
  FileTreeContextMenuItem,
  FileTreeContextMenuOpenContext,
  FileTreeContextMenuTriggerMode,
  FileTreeVisibleRow,
} from '../utils/model/publicTypes'
import type { FileTreeSlotHost } from '../utils/model/internalTypes'
import {
  createContextMenuItem,
  focusFirstMenuElement,
  getContextMenuAnchorButton,
  getContextMenuAnchorTop,
  isEventInContextMenu,
  serializeAnchorRect,
} from '../utils/render/contextMenuAnchor'
import { focusElement } from '../utils/render/focusHelpers'

interface FileTreeContextMenuState {
  readonly anchorRect: FileTreeContextMenuOpenContext['anchorRect'] | null
  readonly item: FileTreeContextMenuItem
  readonly path: string
  readonly source: 'button' | 'keyboard' | 'right-click'
}

export interface UseFileTreeContextMenuOptions {
  readonly composition: FileTreeCompositionOptions | undefined
  readonly controller: FileTreeController
  readonly dom: FileTreeRowDom
  readonly slotHost: FileTreeSlotHost | undefined
  readonly instanceId: string | undefined
  readonly itemHeight: number
  readonly isScrolling: RefObject<boolean>
  readonly scrollSettledRevision: number
  readonly shouldSuppressContextMenu: () => boolean
  readonly focusedPath: string | null
  readonly focusedRowHasVisibleAnchor: boolean
  readonly claimDomFocus: () => void
  readonly ownsDomFocus: () => boolean
  readonly preserveStickyAtScrollTop: (path: string, scrollTop: number | null) => void
  readonly markActiveItem: (path: string) => void
  readonly range: { readonly end: number; readonly start: number }
  readonly resolvedViewportHeight: number
  readonly stickyRows: readonly FileTreeLayoutStickyRow<FileTreeVisibleRow>[]
  readonly visibleRows: readonly FileTreeVisibleRow[]
}

export interface FileTreeContextMenuHandlers {
  readonly anchorRef: RefObject<HTMLDivElement | null>
  readonly triggerRef: RefObject<HTMLButtonElement | null>
  readonly clearHoverPath: () => void
  readonly closeContextMenu: (restoreFocus?: boolean) => void
  readonly closeContextMenuRef: RefObject<(restoreFocus?: boolean) => void>
  readonly contextHoverPath: string | null
  readonly contextMenuAnchorTop: number | null
  readonly contextMenuButtonTriggerEnabled: boolean
  readonly contextMenuButtonVisibility: FileTreeContextMenuButtonVisibility
  readonly contextMenuEnabled: boolean
  readonly contextMenuOpenPath: string | null
  readonly contextMenuPointerAnchorRect: FileTreeContextMenuOpenContext['anchorRect'] | null
  readonly contextMenuRightClickEnabled: boolean
  readonly contextMenuTriggerMode: FileTreeContextMenuTriggerMode
  readonly handleTreePointerLeave: () => void
  readonly handleTreePointerOver: (event: ReactPointerEvent<HTMLDivElement>) => void
  readonly isContextMenuOpen: boolean
  readonly isContextMenuOpenNow: () => boolean
  readonly isPointerContextMenuOpen: boolean
  readonly noteFocusInteraction: () => void
  readonly openContextMenuForRow: (
    row: FileTreeVisibleRow,
    targetPath: string,
    options?: {
      anchorRect?: FileTreeContextMenuOpenContext['anchorRect']
      source?: 'button' | 'keyboard' | 'right-click'
    },
  ) => void
  readonly openMenuFromTrigger: () => void
  readonly triggerButton: HTMLElement | null
  readonly triggerPath: string | null
}

export function useFileTreeContextMenu(
  options: UseFileTreeContextMenuOptions,
): FileTreeContextMenuHandlers {
  'use no memo'
  // Context-menu callbacks must see same-render state through stable refs before layout effects;
  // moving those assignments into effects would change open/close event timing.
  const {
    composition,
    claimDomFocus,
    controller,
    dom,
    focusedPath,
    focusedRowHasVisibleAnchor,
    isScrolling,
    markActiveItem,
    ownsDomFocus,
    preserveStickyAtScrollTop,
    range,
    resolvedViewportHeight,
    scrollSettledRevision,
    slotHost,
    stickyRows,
    visibleRows,
  } = options
  const { getRoot, getRowButtons, getScroll, getStickyRowButtons } = dom
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [contextHoverPath, setContextHoverPath] = useState<string | null>(null)
  const [contextMenuAnchorTop, setContextMenuAnchorTop] = useState<number | null>(null)
  const [lastContextMenuInteraction, setLastContextMenuInteraction] = useState<
    'focus' | 'pointer' | null
  >(null)
  const [contextMenuState, setContextMenuState] = useState<FileTreeContextMenuState | null>(null)
  const contextMenuStateRef = useRef(contextMenuState)
  useLayoutEffect(() => {
    contextMenuStateRef.current = contextMenuState
  }, [contextMenuState])

  const contextMenuEnabled =
    composition?.contextMenu?.enabled === true ||
    composition?.contextMenu?.render != null ||
    composition?.contextMenu?.onOpen != null ||
    composition?.contextMenu?.onClose != null
  const contextMenuTriggerMode =
    composition?.contextMenu?.triggerMode ?? (contextMenuEnabled ? 'right-click' : 'both')
  const contextMenuButtonTriggerEnabled =
    contextMenuTriggerMode === 'both' || contextMenuTriggerMode === 'button'
  const contextMenuButtonVisibility = composition?.contextMenu?.buttonVisibility ?? 'when-needed'
  const contextMenuRightClickEnabled =
    contextMenuTriggerMode === 'both' || contextMenuTriggerMode === 'right-click'

  const getTriggerAnchorButton = useCallback(
    (path: string | null): HTMLElement | null => {
      return getContextMenuAnchorButton(path, getStickyRowButtons(), getRowButtons())
    },
    [getRowButtons, getStickyRowButtons],
  )
  const restoreContextMenuFocus = useCallback(
    (restorePath: string | null): boolean => {
      const focusedButton = restorePath == null ? null : (getRowButtons().get(restorePath) ?? null)
      if (focusElement(focusedButton)) {
        return true
      }

      return focusElement(getRoot())
    },
    [getRoot, getRowButtons],
  )
  const restoreFocusToTree = useCallback(
    (path: string | null): void => {
      const nextFocusedPath = controller.focusNearestPath(path)
      restoreContextMenuFocus(nextFocusedPath)
    },
    [controller, restoreContextMenuFocus],
  )
  const restoreFocusToTreeRef = useRef(restoreFocusToTree)
  useLayoutEffect(() => {
    restoreFocusToTreeRef.current = restoreFocusToTree
  }, [restoreFocusToTree])
  const shouldRestoreContextMenuFocusRef = useRef(true)
  const closeContextMenuRef = useRef<(restoreFocus?: boolean) => void>(() => {})
  const closeContextMenu = useCallback(
    (restoreFocus: boolean = true): void => {
      const currentContextMenuState = contextMenuStateRef.current
      if (currentContextMenuState == null) {
        return
      }

      shouldRestoreContextMenuFocusRef.current =
        shouldRestoreContextMenuFocusRef.current && restoreFocus
      setContextMenuState(null)
      composition?.contextMenu?.onClose?.()
      if (shouldRestoreContextMenuFocusRef.current) {
        restoreFocusToTree(currentContextMenuState.path)
      }
    },
    [composition?.contextMenu, restoreFocusToTree],
  )
  useLayoutEffect(() => {
    closeContextMenuRef.current = closeContextMenu
  }, [closeContextMenu])
  const updateTriggerPosition = useCallback(
    (itemButton: HTMLElement | null): void => {
      const nextTop = itemButton == null ? null : getContextMenuAnchorTop(getRoot(), itemButton)
      setContextMenuAnchorTop((previousTop) => (previousTop === nextTop ? previousTop : nextTop))
    },
    [getRoot],
  )
  const openContextMenuForRow = useCallback(
    (
      row: FileTreeVisibleRow,
      targetPath: string,
      openOptions?: {
        anchorRect?: FileTreeContextMenuOpenContext['anchorRect']
        source?: 'button' | 'keyboard' | 'right-click'
      },
    ): void => {
      const item = controller.getItem(targetPath)
      if (item == null) {
        return
      }

      const anchorButton = getTriggerAnchorButton(targetPath)
      if (anchorButton?.dataset.fileTreeStickyRow === 'true') {
        const scrollElement = getScroll()
        preserveStickyAtScrollTop(targetPath, scrollElement?.scrollTop ?? null)
        claimDomFocus()
        markActiveItem(targetPath)
      }
      // FileTree item focus is controller focus, not DOM focus. Sticky anchor
      // preservation relies on this remaining scroll-neutral so the canonical
      // offscreen row is not revealed before the layout effect restores focus.
      item.focus()
      updateTriggerPosition(anchorButton)
      shouldRestoreContextMenuFocusRef.current = true
      setContextMenuState({
        anchorRect: openOptions?.anchorRect ?? null,
        item: createContextMenuItem(row, targetPath),
        path: targetPath,
        source: openOptions?.source ?? 'keyboard',
      })
    },
    [
      controller,
      getScroll,
      claimDomFocus,
      getTriggerAnchorButton,
      markActiveItem,
      preserveStickyAtScrollTop,
      updateTriggerPosition,
    ],
  )

  useLayoutEffect(() => {
    if (contextMenuEnabled || contextMenuState == null) {
      return
    }

    const staleState = contextMenuState
    queueMicrotask(() => {
      if (contextMenuStateRef.current !== staleState) return
      closeContextMenu(false)
    })
  }, [closeContextMenu, contextMenuEnabled, contextMenuState])

  // Invoking the consumer's `render()` more than once per logical open swaps
  // the returned DOM element, which detaches anything a parent page was about
  // to interact with (Playwright clicks, inline rename input). The previous
  // version keyed this effect on the whole `contextMenuState` object, which is
  // a fresh reference on every `setState` call even when the path + source are
  // unchanged — triggering a React cleanup → re-run cycle that clears and
  // remounts the slot. Keying on a derived string makes the effect idempotent
  // across incidental re-renders and only re-fires when the menu's logical
  // identity actually changes.
  const activeContextMenuKey = useMemo(
    () =>
      contextMenuState == null ? null : `${contextMenuState.path}::${contextMenuState.source}`,
    [contextMenuState],
  )

  useLayoutEffect(() => {
    if (activeContextMenuKey == null) {
      slotHost?.clearSlotContent(CONTEXT_MENU_SLOT_NAME)
      return
    }

    const currentState = contextMenuStateRef.current
    if (currentState == null) {
      return
    }

    const anchorElement = triggerRef.current ?? anchorRef.current
    if (anchorElement == null) {
      return
    }

    const context: FileTreeContextMenuOpenContext = {
      anchorElement,
      anchorRect:
        currentState.anchorRect ?? serializeAnchorRect(anchorElement.getBoundingClientRect()),
      close: (closeOptions) => {
        closeContextMenuRef.current(closeOptions?.restoreFocus ?? true)
      },
      restoreFocus: () => {
        if (!shouldRestoreContextMenuFocusRef.current) {
          return
        }
        restoreFocusToTreeRef.current(contextMenuStateRef.current?.path ?? null)
      },
    }
    const menuContent = composition?.contextMenu?.render?.(currentState.item, context) ?? null
    slotHost?.setSlotContent(CONTEXT_MENU_SLOT_NAME, menuContent)
    composition?.contextMenu?.onOpen?.(currentState.item, context)
    focusFirstMenuElement(menuContent)
    queueMicrotask(() => {
      if (menuContent == null || !menuContent.isConnected) {
        return
      }

      if (document.activeElement !== menuContent) {
        return
      }

      focusFirstMenuElement(menuContent)
    })

    return () => {
      slotHost?.clearSlotContent(CONTEXT_MENU_SLOT_NAME)
    }
  }, [activeContextMenuKey, composition?.contextMenu, slotHost])

  useLayoutEffect(() => {
    if (contextMenuState == null || controller.getItem(contextMenuState.path) != null) return

    const staleState = contextMenuState
    queueMicrotask(() => {
      if (contextMenuStateRef.current !== staleState) return
      closeContextMenu()
    })
  }, [closeContextMenu, contextMenuState, controller])

  useLayoutEffect(() => {
    if (contextMenuState == null) {
      return
    }

    const rootNode = getRoot()?.getRootNode()
    const host = rootNode instanceof ShadowRoot ? rootNode.host : getRoot()
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (isEventInContextMenu(event)) {
        return
      }

      if (anchorRef.current?.contains(target) === true) {
        return
      }

      if (host?.contains(target) === true) {
        return
      }

      closeContextMenu()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeContextMenu()
      }
    }

    document.addEventListener('mousedown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [closeContextMenu, contextMenuState, getRoot])

  const focusTriggerPath =
    contextMenuButtonTriggerEnabled && ownsDomFocus() && focusedRowHasVisibleAnchor
      ? focusedPath
      : null
  const pointerTriggerPath = lastContextMenuInteraction === 'pointer' ? contextHoverPath : null
  const triggerPath =
    contextMenuState?.path ?? pointerTriggerPath ?? focusTriggerPath ?? contextHoverPath
  const isPointerContextMenuOpen = contextMenuState?.source === 'right-click'
  const triggerButton = getTriggerAnchorButton(triggerPath)

  useLayoutEffect(() => {
    if (isScrolling.current && contextMenuState == null) {
      return
    }

    queueMicrotask(() => {
      updateTriggerPosition(getTriggerAnchorButton(triggerPath))
    })
  }, [
    contextMenuState,
    getTriggerAnchorButton,
    range,
    resolvedViewportHeight,
    scrollSettledRevision,
    stickyRows,
    triggerPath,
    updateTriggerPosition,
    visibleRows,
    isScrolling,
  ])

  const handleTreePointerOver = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      if (isScrolling.current) {
        return
      }

      if (isEventInContextMenu(event.nativeEvent)) {
        return
      }

      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }

      if (target.closest?.(`[data-type="${CONTEXT_MENU_TRIGGER_TYPE}"]`) != null) {
        return
      }

      const stickyRowButton = target.closest?.('[data-file-tree-sticky-row="true"]')
      const rowButton = target.closest?.('[data-type="item"]')
      let nextPath: string | null = null
      if (stickyRowButton instanceof HTMLElement) {
        nextPath = stickyRowButton.dataset.fileTreeStickyPath ?? null
      } else if (rowButton instanceof HTMLElement) {
        nextPath = rowButton.dataset.itemPath ?? null
      }

      if (nextPath != null) {
        setLastContextMenuInteraction((previousMode) =>
          previousMode === 'pointer' ? previousMode : 'pointer',
        )
      }
      setContextHoverPath((previousPath) => (previousPath === nextPath ? previousPath : nextPath))
    },
    [isScrolling],
  )

  const handleTreePointerLeave = useCallback((): void => {
    setContextHoverPath(null)
  }, [])

  const noteFocusInteraction = useCallback((): void => {
    setLastContextMenuInteraction('focus')
  }, [])

  const clearHoverPath = useCallback((): void => {
    setContextHoverPath((previousPath) => (previousPath == null ? previousPath : null))
  }, [])

  const isContextMenuOpenNow = useCallback((): boolean => {
    return contextMenuStateRef.current != null
  }, [])

  const openMenuFromTrigger = (): void => {
    if (isScrolling.current) {
      return
    }

    if (!contextMenuButtonTriggerEnabled) {
      return
    }

    if (triggerPath == null || triggerButton == null) {
      return
    }

    const triggerItem = controller.getItem(triggerPath)
    if (triggerItem == null) {
      return
    }

    updateTriggerPosition(triggerButton)
    shouldRestoreContextMenuFocusRef.current = true
    setContextMenuState({
      anchorRect: null,
      item: {
        kind: triggerItem.isDirectory() ? 'directory' : 'file',
        name: triggerButton.getAttribute('aria-label') ?? triggerPath,
        path: triggerItem.getPath(),
      },
      path: triggerItem.getPath(),
      source: 'button',
    })
  }

  return {
    anchorRef,
    triggerRef,
    clearHoverPath,
    closeContextMenu,
    closeContextMenuRef,
    contextHoverPath,
    contextMenuAnchorTop,
    contextMenuButtonTriggerEnabled,
    contextMenuButtonVisibility,
    contextMenuEnabled,
    contextMenuOpenPath: contextMenuState?.path ?? null,
    contextMenuPointerAnchorRect: contextMenuState?.anchorRect ?? null,
    contextMenuRightClickEnabled,
    contextMenuTriggerMode,
    handleTreePointerLeave,
    handleTreePointerOver,
    isContextMenuOpen: contextMenuState != null,
    isContextMenuOpenNow,
    isPointerContextMenuOpen,
    noteFocusInteraction,
    openContextMenuForRow,
    openMenuFromTrigger,
    triggerButton,
    triggerPath,
  }
}
