import type { OrchestrationThreadActivity } from '@workspace/contracts'
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

import {
  chatActivityPresentation,
  type ChatActivityIconKey,
} from '../lib/chat-activity-presentation'

export function ActivityRow({ activity }: { activity: OrchestrationThreadActivity }) {
  const presentation = chatActivityPresentation(activity)
  const Icon = activityIcon(presentation.icon)
  const detail = activityRowDetail(presentation.detail, presentation.status)

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
          title={detail ? `${presentation.title} - ${detail}` : presentation.title}
        >
          <span className='text-foreground/80'>{presentation.title}</span>
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

function activityIconToneClass(tone: OrchestrationThreadActivity['tone']) {
  if (tone === 'error') return 'text-destructive'
  if (tone === 'approval') return 'text-amber-600 dark:text-amber-300'
  if (tone === 'thinking') return 'text-muted-foreground/70'
  if (tone === 'tool') return 'text-sky-600 dark:text-sky-300'

  return 'text-muted-foreground/65'
}

function activityTextToneClass(tone: OrchestrationThreadActivity['tone']) {
  if (tone === 'error') return 'text-destructive'
  if (tone === 'thinking') return 'text-muted-foreground/55'

  return 'text-muted-foreground/75'
}
