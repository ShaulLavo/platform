import { expect, test } from '../../../../test/fixtures'

import type { EditorTabModel } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import {
  sameWorkbenchTabModel,
  workbenchTabCloseTargets,
  workbenchTabModel,
} from '@/features/workbench/utils/tab-model'
import {
  createFileEditorSurface,
  createTerminalSurface,
} from '@workspace/tiling/utils/layout-builders'
import { workbenchWindowId } from '@workspace/tiling/utils/layout-ids'

test('workbench tab model comparison tracks editor chrome metadata', () => {
  const surface = createFileEditorSurface({ path: '/repo/src/app.ts' })
  const left = workbenchTabModel({
    active: true,
    editorTab: editorTab({ diffSuffix: '(abc123 M)', iconName: 'typescript' }),
    surface,
    windowId: workbenchWindowId('main'),
  })
  const right = workbenchTabModel({
    active: true,
    editorTab: editorTab({ diffSuffix: '(abc123 A)', iconName: 'typescript' }),
    surface,
    windowId: workbenchWindowId('main'),
  })

  expect(sameWorkbenchTabModel(left, right)).toBe(false)
})

test('workbench tab close targets mark dirty editor tabs only', () => {
  const editorSurface = createFileEditorSurface({ path: '/repo/src/app.ts' })
  const terminalSurface = createTerminalSurface({ sessionId: 'terminal:test' })
  const editor = workbenchTabModel({
    active: true,
    editorTab: editorTab({ path: '/repo/src/app.ts' }),
    surface: editorSurface,
    windowId: workbenchWindowId('main'),
  })
  const terminal = workbenchTabModel({
    active: false,
    editorTab: null,
    surface: terminalSurface,
    windowId: workbenchWindowId('main'),
  })

  expect(workbenchTabCloseTargets([editor, terminal], new Set(['/repo/src/app.ts']))).toEqual([
    { dirty: true, id: editorSurface.id, path: '/repo/src/app.ts' },
    { dirty: false, id: terminalSurface.id, path: terminal.path },
  ])
})

function editorTab({
  diffSuffix = '',
  iconName = 'file',
  path = '/repo/src/app.ts',
}: {
  readonly diffSuffix?: string
  readonly iconName?: EditorTabModel['icon']['name']
  readonly path?: string
} = {}): EditorTabModel {
  return {
    active: true,
    copyPath: path,
    copyRelativePath: 'src/app.ts',
    diffStatus: diffSuffix ? { className: 'text-warning', label: 'M', title: 'modified' } : null,
    diffSuffix,
    icon: { name: iconName, src: `/vscode-icons/${iconName}.svg` },
    id: `editor-tab:${path}`,
    name: 'app.ts',
    path,
    title: path,
  }
}
