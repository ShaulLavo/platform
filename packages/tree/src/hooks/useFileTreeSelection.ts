'use client'

import type { FileTree } from '@workspace/tree/utils/render/FileTree'
import { areArraysEqual, useFileTreeSelector } from '@workspace/tree/hooks/useFileTreeSelector'

export function useFileTreeSelection(model: FileTree): readonly string[] {
  return useFileTreeSelector(
    model,
    (currentModel) => currentModel.getSelectedPaths(),
    areArraysEqual,
  )
}
