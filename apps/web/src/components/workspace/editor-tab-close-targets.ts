export type EditorTabCloseTargetKind =
  | "close"
  | "closeAll"
  | "closeOthers"
  | "closeSaved"
  | "closeToRight"

export type EditorTabCloseTarget = {
  dirty: boolean
  path: string
}

export function editorTabCloseTargetPaths(
  tabs: readonly EditorTabCloseTarget[],
  targetPath: string,
  kind: EditorTabCloseTargetKind
) {
  const targetIndex = tabs.findIndex((tab) => tab.path === targetPath)
  if (targetIndex === -1) return []

  if (kind === "close") return [targetPath]
  if (kind === "closeOthers") {
    return tabs.filter((tab) => tab.path !== targetPath).map((tab) => tab.path)
  }
  if (kind === "closeToRight") {
    return tabs.slice(targetIndex + 1).map((tab) => tab.path)
  }
  if (kind === "closeSaved") {
    return tabs.filter((tab) => !tab.dirty).map((tab) => tab.path)
  }

  return tabs.map((tab) => tab.path)
}
