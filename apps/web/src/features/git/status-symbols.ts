import type { FileStatus, PanelSection, StatusPresentation } from "./types"

export type GitSymbolSource = PanelSection | "historical"

// TODO(git): Add VS Code-style incoming/outgoing decorations such as "↓M"
// TODO(git): Support the full VS Code status alphabet: copied (C),
// TODO(git): Split staged/worktree theme colors like VS Code's
export function gitStatusSymbol(
  status: FileStatus["index"] | FileStatus["worktree"],
  source: GitSymbolSource
): StatusPresentation {
  const change = gitChangeSymbol(status)
  const prefix = gitSourcePrefix(source)

  return {
    className: change.className,
    label: `${prefix}${change.label}`,
    title: `${gitSourceTitle(source)} ${change.title}`,
  }
}

export function gitChangeSymbol(
  status: FileStatus["index"] | FileStatus["worktree"]
): StatusPresentation {
  if (status === "added") {
    return { className: "text-emerald-500", label: "A", title: "added" }
  }
  if (status === "deleted") {
    return { className: "text-destructive", label: "D", title: "deleted" }
  }
  if (status === "ignored") {
    return { className: "text-muted-foreground", label: "I", title: "ignored" }
  }
  if (status === "renamed") {
    return { className: "text-sky-500", label: "R", title: "renamed" }
  }
  if (status === "untracked") {
    return { className: "text-emerald-500", label: "U", title: "untracked" }
  }
  if (status === "conflicted") {
    return { className: "text-destructive", label: "!", title: "conflicted" }
  }

  return { className: "text-amber-500", label: "M", title: "modified" }
}

function gitSourcePrefix(source: GitSymbolSource) {
  if (source === "staged") return "+"
  if (source === "worktree") return "*"

  return ""
}

function gitSourceTitle(source: GitSymbolSource) {
  if (source === "staged") return "Staged"
  if (source === "worktree") return "Unstaged"

  return "Historical"
}
