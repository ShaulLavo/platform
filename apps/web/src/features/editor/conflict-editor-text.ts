import { createTextDiff, type DiffHunkLine } from "@editor/diff"

export type ConflictEditorTextInput = {
  eventType: "changed" | "deleted" | "renamed"
  localPath: string
  localText: string
  remotePath: string
  remoteText: string | null
}

export function conflictEditorText(conflict: ConflictEditorTextInput) {
  if (conflict.remoteText === null) return wholeFileConflictEditorText(conflict)

  const diff = createTextDiff({
    contextLines: 0,
    newFile: { path: conflict.remotePath, text: conflict.remoteText },
    oldFile: { path: conflict.localPath, text: conflict.localText },
  })
  if (!diff.hunks.length) return conflict.localText

  const localLines = splitConflictTextLines(conflict.localText)
  const chunks: string[] = []
  let localLineIndex = 0

  for (const hunk of diff.hunks) {
    const hunkLocalStart = Math.max(0, hunk.oldStart - 1)
    appendLines(chunks, localLines.slice(localLineIndex, hunkLocalStart))
    chunks.push(conflictMarkerBlock(conflict, hunk.lines))
    localLineIndex = hunkLocalStart + hunk.oldLines
  }

  appendLines(chunks, localLines.slice(localLineIndex))
  return chunks.join("")
}

function wholeFileConflictEditorText(conflict: ConflictEditorTextInput) {
  const localText = ensureTrailingNewline(conflict.localText)

  return `<<<<<<< Local: ${conflict.localPath}\n${localText}=======\n>>>>>>> Remote: ${conflict.remotePath}\n`
}

function conflictMarkerBlock(
  conflict: ConflictEditorTextInput,
  lines: readonly DiffHunkLine[]
) {
  const localLines = sideLines(lines, "local")
  const remoteLines = sideLines(lines, "remote")

  return [
    `<<<<<<< Local: ${conflict.localPath}`,
    ...localLines,
    "=======",
    ...remoteLines,
    `>>>>>>> Remote: ${conflict.remotePath}`,
  ]
    .map((line) => `${line}\n`)
    .join("")
}

function sideLines(lines: readonly DiffHunkLine[], side: "local" | "remote") {
  const skippedType = side === "local" ? "addition" : "deletion"

  return lines
    .filter((line) => line.type !== skippedType)
    .map((line) => line.text)
}

function splitConflictTextLines(text: string) {
  if (!text) return []

  const lines = text.split("\n")
  if (text.endsWith("\n")) lines.pop()

  return lines
}

function appendLines(chunks: string[], lines: readonly string[]) {
  for (const line of lines) chunks.push(`${line}\n`)
}

function ensureTrailingNewline(text: string) {
  if (!text) return ""
  if (text.endsWith("\n")) return text

  return `${text}\n`
}
