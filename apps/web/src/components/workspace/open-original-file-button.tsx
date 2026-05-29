import { FileIcon } from '@phosphor-icons/react'

import { ToolbarIconButton } from '@/components/workspace/toolbar-icon-button'
import { displayPath } from '@/lib/path-formatters'

export function OpenOriginalFileButton({
  path,
  onOpenFile,
}: {
  path: string
  onOpenFile: (path: string) => void
}) {
  const label = `Open original file: ${displayPath(path)}`

  function handleClick() {
    onOpenFile(path)
  }

  return (
    <ToolbarIconButton label={label} onClick={handleClick}>
      <FileIcon className='size-3.5' />
    </ToolbarIconButton>
  )
}
