export type EditorTabDropTargetBounds = {
  id: string
  left: number
  path: string
  right: number
}

export function editorTabDropIndex(
  bounds: readonly EditorTabDropTargetBounds[],
  clientX: number,
  draggedTabId: string
) {
  const targets = bounds.filter((bound) => bound.id !== draggedTabId)
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index]
    if (!target) continue
    if (clientX < editorTabDropTargetMidpoint(target)) return index
  }

  return targets.length
}

function editorTabDropTargetMidpoint(target: EditorTabDropTargetBounds) {
  return target.left + (target.right - target.left) / 2
}
