import type { EditorKeymapLayer } from '@singapor/core'
import { FileDashedIcon } from '@phosphor-icons/react'

import {
  EMPTY_GIT_FILES,
  editorTabModel,
} from '@/components/workspace/editor-tabs/utils/editor-tab-model'
import { EditorSurfaceTabBody } from '@/features/workbench/components/editor-surface-tab-body'
import { EditorTabBar } from '@/features/workbench/components/editor-tab-bar'
import type { FileStatus } from '@/features/git/types'
import type { EditorTabConflictMap } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import type { WorkbenchPanels } from '@/features/workbench/utils/workbench-panels'

export function CodePanel({
  conflicts,
  editorKeymapLayers,
  gitFiles = EMPTY_GIT_FILES,
  panels,
  rootPath,
}: {
  readonly conflicts: EditorTabConflictMap
  readonly editorKeymapLayers: readonly EditorKeymapLayer[]
  readonly gitFiles?: readonly FileStatus[]
  readonly panels: WorkbenchPanels
  readonly rootPath: string
}) {
  const tabModels = panels.editorTabs.map((tab) =>
    editorTabModel({
      conflicts,
      gitFiles,
      rootPath,
      selectedTabId: panels.activeEditorTabId,
      tab,
    }),
  )
  const activeTab = panels.editorTabs.find((tab) => tab.id === panels.activeEditorTabId) ?? null

  return (
    <section className='bg-card-solid/95 border-border flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
      <EditorTabBar tabs={tabModels} />
      <div className='min-h-0 min-w-0 flex-1 overflow-hidden'>
        {activeTab ? (
          <EditorSurfaceTabBody
            active
            editorKeymapLayers={editorKeymapLayers}
            path={activeTab.path}
            rootPath={rootPath}
            tabId={activeTab.id}
          />
        ) : (
          <div className='grid h-full place-items-center'>
            <div className='flex flex-col items-center gap-3'>
              <FileDashedIcon className='text-muted-foreground/50 size-8' />
              <p className='text-muted-foreground text-sm'>No file selected</p>
              <p className='text-muted-foreground/70 flex items-center gap-2 text-xs'>
                <kbd className='border-border bg-muted text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-[10px]'>
                  ⌘P
                </kbd>
                Quick access
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
