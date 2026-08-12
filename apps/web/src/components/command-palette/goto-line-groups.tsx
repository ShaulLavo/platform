import { ArrowRightIcon } from '@phosphor-icons/react'
import { CommandGroup, CommandItem } from '@workspace/ui/components/command'

import { useCommandPaletteActions } from '@/components/command-palette/hooks/use-command-palette-actions'
import { gotoLineTargetLabel, parseGotoLineTarget } from './goto-line-target'

type GotoLineGroupsProps = {
  readonly query: string
}

export function GotoLineGroups({ query }: GotoLineGroupsProps) {
  const { selectGotoLine } = useCommandPaletteActions()
  const target = parseGotoLineTarget(query)

  if (!target) {
    return (
      <CommandGroup heading='Go to line'>
        <CommandItem disabled value='goto-line:hint'>
          <ArrowRightIcon className='text-muted-foreground' />
          <span className='text-muted-foreground text-sm'>Type a line number, or line:column</span>
        </CommandItem>
      </CommandGroup>
    )
  }

  return (
    <CommandGroup heading='Go to line'>
      {/* The row always matches: the query is a line number, not something to filter against. */}
      <CommandItem
        keywords={[query]}
        value={`goto-line:${target.line}:${target.column}`}
        onSelect={() => selectGotoLine(target)}
      >
        <ArrowRightIcon className='text-muted-foreground' />
        <span className='min-w-0 flex-1 truncate'>{gotoLineTargetLabel(target)}</span>
      </CommandItem>
    </CommandGroup>
  )
}
