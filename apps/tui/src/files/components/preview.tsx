import { RingLoader } from '@/components/ring-loader'
import { EmptyState } from '@/components/empty-state'
import type { FileBrowser } from '@/files/state/browser'
import { previewText } from '@/files/utils/list'
import type { Theme } from '@/theme/utils/theme'

export function FilePreview({
  preview,
  theme,
  lines,
}: {
  preview: ReturnType<FileBrowser['getSnapshot']>['preview']
  theme: Theme
  lines: number
}) {
  return (
    <box
      flexGrow={1}
      flexBasis={0}
      minWidth={0}
      minHeight={0}
      flexDirection='column'
      overflow='hidden'
    >
      {preview.kind === 'empty' && (
        <EmptyState
          title='File preview'
          description='Choose a file to read its contents.'
          theme={theme}
        />
      )}
      {preview.kind === 'loading' && <RingLoader theme={theme} label='Reading file…' />}
      {preview.kind === 'failed' && <text fg={theme.destructive}>{preview.message}</text>}
      {preview.kind === 'ready' && (
        <>
          <text fg={theme.mutedForeground} flexShrink={0}>
            {preview.path} · preview
          </text>
          <text fg={theme.foreground}>{previewText(preview.content, lines)}</text>
        </>
      )}
    </box>
  )
}
