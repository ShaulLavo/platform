export type DiagnosticPeekClientRect = {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
  readonly width: number
  readonly height: number
}

type DiagnosticPeekPlacementInput = {
  readonly anchorRect: DiagnosticPeekClientRect
  readonly clipRect: DiagnosticPeekClientRect
  readonly layerRect: DiagnosticPeekClientRect
  readonly surfaceHeight: number
  readonly surfaceWidth: number
  readonly gap?: number
}

export type DiagnosticPeekPlacement = { readonly left: number; readonly top: number }

export function copyDiagnosticPeekClientRect(
  rect: DiagnosticPeekClientRect,
): DiagnosticPeekClientRect {
  return Object.freeze({
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
  })
}

export function diagnosticPeekPlacement({
  anchorRect,
  clipRect,
  layerRect,
  surfaceHeight,
  surfaceWidth,
  gap = 6,
}: DiagnosticPeekPlacementInput): DiagnosticPeekPlacement {
  const below = anchorRect.bottom + gap
  const above = anchorRect.top - gap - surfaceHeight
  const viewportTop = clipRect.top
  const viewportBottom = clipRect.bottom
  const clientTop = below + surfaceHeight <= viewportBottom ? below : Math.max(viewportTop, above)
  const maxLeft = Math.max(clipRect.left, clipRect.right - surfaceWidth)
  const clientLeft = Math.min(Math.max(anchorRect.left, clipRect.left), maxLeft)

  return { left: clientLeft - layerRect.left, top: clientTop - layerRect.top }
}
