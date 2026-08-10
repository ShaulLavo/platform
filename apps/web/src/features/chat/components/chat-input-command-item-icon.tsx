import { SparkleIcon, TerminalWindowIcon } from '@phosphor-icons/react'

import { fileIconStyle } from '@/lib/file-icon-style'
import { iconForEntry } from '@/lib/file-icons'

import type { ChatInputCommandItem } from '../lib/chat-input-logic'

export function ChatInputCommandItemIcon({ item }: { item: ChatInputCommandItem }) {
  if (item.type === 'skill') {
    return <SparkleIcon className='text-muted-foreground/80 size-4 shrink-0' />
  }
  if (item.type === 'slash-command' || item.type === 'provider-command') {
    return <TerminalWindowIcon className='text-muted-foreground/80 size-4 shrink-0' />
  }

  const icon = iconForEntry({ name: item.label, type: item.entryType })

  return <span aria-hidden='true' className='size-4 shrink-0' style={fileIconStyle(icon)} />
}
