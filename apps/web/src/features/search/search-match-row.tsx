import { FileTextIcon } from "@phosphor-icons/react"
import type { WorkspaceSearchMatch } from "@workspace/contracts"
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"

import { searchMatchDisplay } from "@/features/search/search-match-display"
import { HighlightedPreview } from "@/features/search/search-highlight"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

const SEARCH_PREVIEW_CHARACTER_WIDTH = 7
const SEARCH_PREVIEW_MIN_CHARACTERS = 8

export function SearchMatchRow({
  active,
  className,
  canReplace,
  match,
  previewMaxLength,
  replaceVisible,
  query,
  onOpenMatch,
  onReplaceMatch,
}: {
  active?: boolean
  className?: string
  canReplace?: boolean
  match: WorkspaceSearchMatch
  previewMaxLength?: number
  replaceVisible?: boolean
  query: string
  onOpenMatch: (match: WorkspaceSearchMatch) => void
  onReplaceMatch?: (match: WorkspaceSearchMatch) => void
}) {
  const previewRef = useRef<HTMLSpanElement | null>(null)
  const location = searchMatchLocation(match)
  const measuredPreviewMaxLength = useMeasuredPreviewMaxLength(
    previewRef,
    previewMaxLength
  )
  const display = searchMatchDisplay(match, query, {
    maxLength: matchPreviewMaxLength(match, measuredPreviewMaxLength),
  })

  return (
    <div
      className={cn(
        "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 overflow-hidden px-2 py-1.5 text-left text-xs",
        active && "bg-muted/60 ring-1 ring-ring/50",
        className
      )}
    >
      <button
        className="grid w-full min-w-0 grid-cols-[42px_minmax(0,1fr)] gap-2 text-left outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50"
        tabIndex={-1}
        type="button"
        onClick={() => onOpenMatch(match)}
      >
        <span className="text-right text-[11px] text-muted-foreground tabular-nums">
          {location}
        </span>
        <span className="flex min-w-0 items-center gap-2 overflow-hidden">
          <span
            className="block min-w-0 flex-1 truncate font-mono text-[11px] leading-5"
            ref={previewRef}
          >
            <HighlightedPreview
              preview={display.text}
              query={query}
              range={display.range}
            />
          </span>
          {match.source === "open-buffer" ? (
            <span className="shrink-0 rounded border px-1 text-[10px] leading-4 text-muted-foreground">
              unsaved
            </span>
          ) : null}
        </span>
      </button>
      {replaceVisible ? (
        <Button
          className="h-6 px-1.5 text-[10px]"
          disabled={!canReplace}
          size="xs"
          title="Replace this match"
          type="button"
          variant="ghost"
          onClick={() => onReplaceMatch?.(match)}
        >
          Replace
        </Button>
      ) : null}
    </div>
  )
}

export function SearchNameMatchRow({
  active,
  className,
  match,
  previewMaxLength,
  query,
  onOpenMatch,
}: {
  active?: boolean
  className?: string
  match: WorkspaceSearchMatch
  previewMaxLength?: number
  query: string
  onOpenMatch: (match: WorkspaceSearchMatch) => void
}) {
  const previewRef = useRef<HTMLSpanElement | null>(null)
  const measuredPreviewMaxLength = useMeasuredPreviewMaxLength(
    previewRef,
    previewMaxLength
  )
  const display = searchMatchDisplay(match, query, {
    maxLength: measuredPreviewMaxLength,
  })

  return (
    <button
      className={cn(
        "grid w-full min-w-0 grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-1.5 overflow-hidden px-2 py-1.5 text-left outline-none hover:bg-muted/70 focus-visible:ring-1 focus-visible:ring-ring/50",
        active && "bg-muted/60 ring-1 ring-ring/50",
        className
      )}
      tabIndex={-1}
      type="button"
      onClick={() => onOpenMatch(match)}
    >
      <FileTextIcon className="size-3.5 text-muted-foreground" />
      <span className="block min-w-0 truncate text-xs" ref={previewRef}>
        <HighlightedPreview
          preview={display.text}
          query={query}
          range={display.range}
        />
      </span>
      <span className="rounded border px-1.5 text-[10px] leading-4 text-muted-foreground">
        name
      </span>
    </button>
  )
}

function searchMatchLocation(match: WorkspaceSearchMatch) {
  if (match.kind === "name") return "name"
  if (match.line === undefined) return "match"

  return String(match.line)
}

function matchPreviewMaxLength(
  match: WorkspaceSearchMatch,
  previewMaxLength: number | undefined
) {
  if (match.source !== "open-buffer") return previewMaxLength
  if (previewMaxLength === undefined) return undefined

  return Math.max(12, previewMaxLength - 8)
}

function useMeasuredPreviewMaxLength(
  ref: RefObject<HTMLSpanElement | null>,
  fallback: number | undefined
) {
  const width = useElementWidth(ref)

  return useMemo(
    () => measuredPreviewMaxLength(width, fallback),
    [fallback, width]
  )
}

function useElementWidth<TElement extends HTMLElement>(
  ref: RefObject<TElement | null>
) {
  const [width, setWidth] = useState<number | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    function updateWidth() {
      setWidth(element?.clientWidth ?? null)
    }

    updateWidth()

    if (!("ResizeObserver" in window)) return

    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)

    return () => observer.disconnect()
  }, [ref])

  return width
}

function measuredPreviewMaxLength(
  width: number | null,
  fallback: number | undefined
) {
  if (width === null) return fallback

  const measured = Math.max(
    SEARCH_PREVIEW_MIN_CHARACTERS,
    Math.floor(width / SEARCH_PREVIEW_CHARACTER_WIDTH)
  )
  if (fallback === undefined) return measured

  return Math.min(fallback, measured)
}
