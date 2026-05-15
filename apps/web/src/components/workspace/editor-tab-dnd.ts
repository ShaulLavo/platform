export type EditorTabDropTargetBounds = {
  left: number
  path: string
  right: number
}

export function editorTabDropIndex(
  bounds: readonly EditorTabDropTargetBounds[],
  clientX: number,
  draggedPath: string
) {
  const targets = bounds.filter((bound) => bound.path !== draggedPath)
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
