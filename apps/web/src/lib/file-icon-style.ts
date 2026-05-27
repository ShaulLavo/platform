import type { CSSProperties } from 'react'

import { colorForFileIcon, type ResolvedFileIcon } from './file-icons'

export function fileIconStyle(icon: ResolvedFileIcon): CSSProperties {
  const mask = `url(${icon.src}) center / contain no-repeat`

  return {
    backgroundColor: colorForFileIcon(icon),
    mask,
    WebkitMask: mask,
  }
}
