import { Panel as GitPanel } from '@/features/git/panel'
import type { GitStoreApi } from '@/features/git/state'
import { ToolPaneHeader } from '@/features/workbench/components/tool-pane-header'

export function GitChangesPanel({
  rootPath,
  store,
}: {
  readonly rootPath: string
  readonly store: GitStoreApi
}) {
  return (
    <section className='flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
      <ToolPaneHeader tab='git' />
      <div className='min-h-0 min-w-0 flex-1 overflow-hidden'>
        <GitPanel rootPath={rootPath} store={store} />
      </div>
    </section>
  )
}
