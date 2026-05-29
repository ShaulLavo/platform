import { DiffViewModeToggle } from '@/components/workspace/diff-view-mode-toggle'
import { OpenOriginalFileButton } from '@/components/workspace/open-original-file-button'
import { RevealChangeButton } from '@/components/workspace/reveal-change-button'
import type { EditorDiffViewMode } from '@/features/editor/utils/diff-view-mode'

export function DiffTabActions({
  diffPath,
  mode,
  onModeChange,
  onOpenFile,
  onRevealNextChange,
  onRevealPreviousChange,
}: {
  diffPath: string
  mode: EditorDiffViewMode
  onModeChange: (mode: EditorDiffViewMode) => void
  onOpenFile: (path: string) => void
  onRevealNextChange?: () => void
  onRevealPreviousChange?: () => void
}) {
  return (
    <div className='bg-background/40 flex h-full shrink-0 items-center gap-0.5 border-l px-1'>
      <RevealChangeButton direction='previous' onRevealChange={onRevealPreviousChange} />
      <RevealChangeButton direction='next' onRevealChange={onRevealNextChange} />
      <OpenOriginalFileButton path={diffPath} onOpenFile={onOpenFile} />
      <DiffViewModeToggle mode={mode} onModeChange={onModeChange} />
    </div>
  )
}
