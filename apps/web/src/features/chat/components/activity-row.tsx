import { cn } from '@workspace/ui/lib/utils'
import {
  BrainIcon,
  CheckCircleIcon,
  FileTextIcon,
  InfoIcon,
  ListChecksIcon,
  ShieldCheckIcon,
  TerminalWindowIcon,
  UserCircleIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'

import type { ChatActivityIconKey } from '../lib/chat-activity-presentation'
import type { ChatWorkLogEntry, ChatWorkLogTone } from '../lib/chat-work-log'

export function ActivityRow({ activity }: { activity: ChatWorkLogEntry }) {
  const Icon = activityIcon(activity.icon)
  const detail = activityRowDetail(activity.detail, activity.status)

  return (
    <div className='rounded-md px-1 py-1'>
      <div className='flex min-w-0 items-center gap-2'>
        <span
          className={cn(
            'flex size-5 shrink-0 items-center justify-center text-muted-foreground/65',
            activityIconToneClass(activity.tone),
          )}
        >
          <Icon className='size-3' />
        </span>
        <p
          className={cn(
            'min-w-0 flex-1 truncate text-[11px] leading-5',
            activityTextToneClass(activity.tone),
          )}
          title={detail ? `${activity.title} - ${detail}` : activity.title}
        >
          <span className='text-foreground/80'>{activity.title}</span>
          {detail ? <span className='text-muted-foreground/55'> - {detail}</span> : null}
        </p>
      </div>
    </div>
  )
}

function activityIcon(icon: ChatActivityIconKey) {
  if (icon === 'approval') return ShieldCheckIcon
  if (icon === 'context') return FileTextIcon
  if (icon === 'error') return WarningCircleIcon
  if (icon === 'task') return ListChecksIcon
  if (icon === 'thinking') return BrainIcon
  if (icon === 'tool') return TerminalWindowIcon
  if (icon === 'user-input') return UserCircleIcon
  if (icon === 'info') return InfoIcon

  return CheckCircleIcon
}

function activityRowDetail(detail: string | null, status: string | null) {
  if (detail) return detail
  if (!status) return null
  if (status === 'Completed') return null

  return status
}

function activityIconToneClass(tone: ChatWorkLogTone) {
  if (tone === 'error') return 'text-destructive'
  if (tone === 'thinking') return 'text-muted-foreground/70'
  if (tone === 'tool') return 'text-info'

  return 'text-muted-foreground/65'
}

function activityTextToneClass(tone: ChatWorkLogTone) {
  if (tone === 'error') return 'text-destructive'
  if (tone === 'thinking') return 'text-muted-foreground/55'

  return 'text-muted-foreground/75'
}
