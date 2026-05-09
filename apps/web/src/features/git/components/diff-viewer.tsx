import { DiffView, type DiffFile, type DiffHunkLine } from "@editor/diff"
import "@editor/diff/style.css"
import { WarningCircleIcon } from "@phosphor-icons/react"
import { useLayoutEffect, useMemo, useRef, type CSSProperties } from "react"

import { languageIdForFilePath } from "@/components/editor/file-path"
import { useTheme } from "@/components/theme-provider"
import { errorMessage } from "@/lib/file-server"
import { displayPath } from "@/lib/path-formatters"
import type { DiffHunk as GitDiffHunk, FileDiff, LineChange } from "../types"

type GitDiffViewerProps = {
  diff: FileDiff | null
  error: unknown
  isError: boolean
  isPending: boolean
  path: string
}

export function GitDiffViewer({
  diff,
  error,
  isError,
  isPending,
  path,
}: GitDiffViewerProps) {
  const diffFile = useMemo(() => (diff ? editorDiffFile(diff) : null), [diff])

  if (isPending) {
    return <DiffState message={`Loading diff for ${displayPath(path)}...`} />
  }

  if (isError) {
    return (
      <DiffState
        icon
        message={`Git diff failed for ${displayPath(path)}.`}
        detail={errorMessage(error)}
      />
    )
  }

  if (!diffFile?.hunks.length) {
    return (
      <DiffState message={`No git diff available for ${displayPath(path)}.`} />
    )
  }

  return <EditorDiffView file={diffFile} />
}

function EditorDiffView({ file }: { file: DiffFile }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<DiffView | null>(null)
  const { theme } = useTheme()
  const shikiTheme = resolvedShikiTheme(theme)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return

    const view = new DiffView(host, {
      mode: "split",
      showFileList: false,
      theme: shikiTheme,
    })
    viewRef.current = view

    return () => {
      view.dispose()
      viewRef.current = null
    }
  }, [shikiTheme])

  useLayoutEffect(() => {
    viewRef.current?.setFiles([file])
  }, [file, shikiTheme])

  return (
    <div
      ref={hostRef}
      className="flex min-h-0 min-w-0 flex-1 bg-background text-foreground"
      style={diffViewStyle}
    />
  )
}

const diffViewStyle = {
  "--editor-background": "var(--background)",
  "--editor-foreground": "var(--foreground)",
  "--editor-gutter-background": "var(--background)",
  "--editor-gutter-foreground": "var(--muted-foreground)",
  "--editor-diff-background": "var(--background)",
  "--editor-diff-foreground": "var(--foreground)",
  "--editor-diff-gutter-background": "var(--background)",
  "--editor-diff-gutter-foreground": "var(--muted-foreground)",
} as CSSProperties

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
    lines: hunk.changes.map(editorDiffLine),
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
