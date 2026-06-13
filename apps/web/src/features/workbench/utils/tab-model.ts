import type { EditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import type { Surface, SurfaceId, WindowId } from '@workspace/tiling/utils/layout-types'

export type WorkbenchTabModel = {
  readonly active: boolean
  readonly editorTab: EditorTabModel | null
  readonly id: SurfaceId
  readonly path: string
  readonly surface: Surface
  readonly windowId: WindowId
}

export type WorkbenchTabCloseTarget = {
  readonly dirty: boolean
  readonly id: SurfaceId
  readonly path: string
}

export function workbenchTabModel({
  active,
  editorTab,
  surface,
  windowId,
}: {
  readonly active: boolean
  readonly editorTab: EditorTabModel | null
  readonly surface: Surface
  readonly windowId: WindowId
}): WorkbenchTabModel {
  return {
    active,
    editorTab,
    id: surface.id,
    path: editorTab?.path ?? surface.resourceKey ?? String(surface.id),
    surface,
    windowId,
  }
}

export function sameWorkbenchTabModel(left: WorkbenchTabModel, right: WorkbenchTabModel) {
  if (left.id !== right.id) return false
  if (left.active !== right.active) return false
  if (left.path !== right.path) return false
  if (left.surface.title !== right.surface.title) return false
  if (left.surface.type !== right.surface.type) return false

  return sameEditorTabModel(left.editorTab, right.editorTab)
}

export function workbenchTabCloseTargets(
  tabs: readonly WorkbenchTabModel[],
  dirtyFilePaths: ReadonlySet<string>,
): readonly WorkbenchTabCloseTarget[] {
  return tabs.map((tab) => ({
    dirty: tab.editorTab ? dirtyFilePaths.has(tab.editorTab.path) : false,
    id: tab.id,
    path: tab.path,
  }))
}

function sameEditorTabModel(left: EditorTabModel | null, right: EditorTabModel | null) {
  if (!left || !right) return left === right
  if (left.active !== right.active) return false
  if (left.copyPath !== right.copyPath) return false
  if (left.copyRelativePath !== right.copyRelativePath) return false
  if (left.diffSuffix !== right.diffSuffix) return false
  if (left.id !== right.id) return false
  if (left.icon.name !== right.icon.name) return false
  if (left.icon.src !== right.icon.src) return false
  if (left.name !== right.name) return false
  if (left.path !== right.path) return false
  if (left.title !== right.title) return false

  return sameDiffStatus(left, right)
}

function sameDiffStatus(left: EditorTabModel, right: EditorTabModel) {
  if (!left.diffStatus || !right.diffStatus) return left.diffStatus === right.diffStatus
  if (left.diffStatus.className !== right.diffStatus.className) return false
  if (left.diffStatus.label !== right.diffStatus.label) return false

  return left.diffStatus.title === right.diffStatus.title
}
