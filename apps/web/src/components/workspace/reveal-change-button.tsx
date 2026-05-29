import { ArrowDownIcon, ArrowUpIcon } from '@phosphor-icons/react'

import { capitalize } from '@/components/workspace/editor-tab-text-utils'
import { ToolbarIconButton } from '@/components/workspace/toolbar-icon-button'

export function RevealChangeButton({
  direction,
  onRevealChange,
}: {
  direction: 'previous' | 'next'
  onRevealChange?: () => void
}) {
  const label = `${capitalize(direction)} change`
  const Icon = direction === 'previous' ? ArrowUpIcon : ArrowDownIcon

  return (
    <ToolbarIconButton disabled={!onRevealChange} label={label} onClick={() => onRevealChange?.()}>
      <Icon className='size-3.5' />
    </ToolbarIconButton>
  )
}
