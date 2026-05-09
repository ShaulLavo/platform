import {
  DiffView,
  annotateInlineChanges,
  type DiffFile,
  type DiffHunkLocation,
  type DiffHunkLine,
  type DiffSplitHandleContext,
} from "@editor/diff"
import "@editor/diff/style.css"
import "./diff-viewer.css"
import { WarningCircleIcon } from "@phosphor-icons/react"
import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type RefObject,
} from "react"

import type { EditorDiffViewMode } from "@/features/editor/utils/diff-view-mode"
import { languageIdForFilePath } from "@/features/editor/utils/file-path"
import { useTheme } from "@/components/theme-context"
import { errorMessage } from "@/lib/file-server"
import { displayPath } from "@/lib/path-formatters"
import type { DiffHunk as GitDiffHunk, FileDiff, LineChange } from "../types"

type GitDiffViewerProps = {
  diff: FileDiff | null
  error: unknown
  isError: boolean
  isPending: boolean
  mode: EditorDiffViewMode
  path: string
}

type HunkRevealOptions = { readonly wrap?: boolean }

export type GitDiffViewerHandle = {
  getCurrentHunk: () => DiffHunkLocation | null
  revealHunk: (index: number) => boolean
  revealNextHunk: (options?: HunkRevealOptions) => boolean
  revealPreviousHunk: (options?: HunkRevealOptions) => boolean
}

export const GitDiffViewer = forwardRef<GitDiffViewerHandle, GitDiffViewerProps>(
  function GitDiffViewer(
    { diff, error, isError, isPending, mode, path },
    ref
  ) {
    const diffFile = useMemo(() => (diff ? editorDiffFile(diff) : null), [diff])
    const viewRef = useRef<GitDiffViewerHandle | null>(null)

    useImperativeHandle(ref, () => diffViewerHandle(viewRef), [])

    if (diffFile?.hunks.length) {
      return <EditorDiffView ref={viewRef} file={diffFile} mode={mode} />
    }

    if (isPending) return null

    if (isError) {
      return (
        <DiffState
          icon
          message={`Git diff failed for ${displayPath(path)}.`}
          detail={errorMessage(error)}
        />
      )
    }

    return (
      <DiffState message={`No git diff available for ${displayPath(path)}.`} />
    )
  }
)

function diffViewerHandle(
  viewRef: RefObject<GitDiffViewerHandle | null>
): GitDiffViewerHandle {
  return {
    getCurrentHunk: () => viewRef.current?.getCurrentHunk() ?? null,
    revealHunk: (index) => viewRef.current?.revealHunk(index) ?? false,
    revealNextHunk: (options) =>
      viewRef.current?.revealNextHunk(options) ?? false,
    revealPreviousHunk: (options) =>
      viewRef.current?.revealPreviousHunk(options) ?? false,
  }
}

const EditorDiffView = forwardRef<
  GitDiffViewerHandle,
  {
    file: DiffFile
    mode: EditorDiffViewMode
  }
>(function EditorDiffView({ file, mode }, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<DiffView | null>(null)
  const { theme } = useTheme()
  const shikiTheme = resolvedShikiTheme(theme)

  useImperativeHandle(ref, () => diffViewHandle(viewRef), [])

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return

    const view = new DiffView(host, {
      mode: "split",
      showFileList: false,
      splitPane: {
        createHandle: createGitDiffSplitHandle,
      },
      theme: shikiTheme,
    })
    viewRef.current = view

    return () => {
      view.dispose()
      viewRef.current = null
    }
  }, [shikiTheme])

  useLayoutEffect(() => {
    viewRef.current?.setMode(mode)
  }, [mode, shikiTheme])

  useLayoutEffect(() => {
    viewRef.current?.setFiles([file])
  }, [file, shikiTheme])

  return (
    <div
      ref={hostRef}
      className="flex h-full min-h-0 min-w-0 flex-1 bg-background text-foreground"
      style={diffViewStyle}
    />
  )
})

function diffViewHandle(
  viewRef: RefObject<DiffView | null>
): GitDiffViewerHandle {
  return {
    getCurrentHunk: () => viewRef.current?.getCurrentHunk() ?? null,
    revealHunk: (index) => viewRef.current?.revealHunk(index) ?? false,
    revealNextHunk: (options) =>
      viewRef.current?.revealNextHunk(options) ?? false,
    revealPreviousHunk: (options) =>
      viewRef.current?.revealPreviousHunk(options) ?? false,
  }
}

const diffViewStyle = {
  "--editor-background": "var(--background)",
  "--editor-foreground": "var(--foreground)",
  "--editor-gutter-background": "var(--background)",
  "--editor-gutter-foreground": "var(--muted-foreground)",
  "--editor-diff-background": "var(--background)",
  "--editor-diff-border": "var(--border)",
  "--editor-diff-foreground": "var(--foreground)",
  "--editor-diff-gutter-background": "var(--background)",
  "--editor-diff-gutter-foreground": "var(--muted-foreground)",
} as CSSProperties

function createGitDiffSplitHandle({
  document,
}: DiffSplitHandleContext): HTMLElement {
  const handle = document.createElement("div")
  const line = document.createElement("span")
  handle.className = "app-git-diff-split-handle"
  handle.style.cursor = "ew-resize"
  handle.style.width = "1px"
  line.className = "app-git-diff-split-handle-line"
  line.setAttribute("aria-hidden", "true")
  handle.appendChild(line)
  return handle
}

function DiffState({
  detail,
  icon = false,
  message,
}: {
  detail?: string
  icon?: boolean
  message: string
}) {
  return (
    <div className="flex min-h-0 items-center justify-center p-6 text-xs text-muted-foreground">
      {icon ? <WarningCircleIcon className="mr-2 size-4" /> : null}
      <span>{message}</span>
      {detail ? <span className="ml-2 text-destructive">{detail}</span> : null}
    </div>
  )
}

function editorDiffFile(diff: FileDiff): DiffFile {
  const oldPath = diff.oldPath ?? diff.path
  const languageId = languageIdForFilePath(diff.path)
  const oldLines = textLines(diff.oldText) ?? collectLines(diff.hunks, "old")
  const newLines = textLines(diff.newText) ?? collectLines(diff.hunks, "new")

  return {
    changeType: "change",
    hunks: diff.hunks.map(editorDiffHunk),
    isPartial: diff.oldText === undefined || diff.newText === undefined,
    languageId,
    newLines,
    newPath: diff.path,
    oldLines,
    oldPath,
    path: diff.path,
  }
}

function editorDiffHunk(hunk: GitDiffHunk) {
  return {
    header: hunk.header,
    lines: annotateInlineChanges(hunk.changes.map(editorDiffLine)),
    newLines: hunk.newLines,
    newStart: hunk.newStart,
    oldLines: hunk.oldLines,
    oldStart: hunk.oldStart,
  }
}

function editorDiffLine(change: LineChange): DiffHunkLine {
  if (change.type === "added") {
    return {
      newLineNumber: change.newLine ?? undefined,
      text: change.text,
      type: "addition",
    }
  }

  if (change.type === "deleted") {
    return {
      oldLineNumber: change.oldLine ?? undefined,
      text: change.text,
      type: "deletion",
    }
  }

  return {
    newLineNumber: change.newLine ?? undefined,
    oldLineNumber: change.oldLine ?? undefined,
    text: change.text,
    type: "context",
  }
}

function collectLines(hunks: readonly GitDiffHunk[], side: "old" | "new") {
  const lines: string[] = []

  for (const hunk of hunks) {
    for (const change of hunk.changes) {
      if (side === "old" && change.type === "added") continue
      if (side === "new" && change.type === "deleted") continue

      lines.push(change.text)
    }
  }

  return lines
}

function textLines(text: string | undefined) {
  if (text === undefined) return null
  if (text.length === 0) return []

  return text.split("\n")
}

function resolvedShikiTheme(theme: "dark" | "light" | "system") {
  if (theme === "dark") return "github-dark"
  if (theme === "light") return "github-light"
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "github-dark"
  }

  return "github-light"
}
