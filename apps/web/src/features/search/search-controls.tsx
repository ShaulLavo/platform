import { AsteriskIcon, FunnelSimpleIcon, TextAaIcon, TextTIcon } from '@phosphor-icons/react'
import type { ChangeEvent, ReactNode } from 'react'

import type { SearchBufferOptionPatch } from '@/features/search/search-buffer-state'
import { SearchHistoryInput } from '@/features/search/search-history-input'
import type { WorkspaceSearchQueryOptions } from '@/features/search/use-search-buffer'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@workspace/ui/components/tooltip'
import { cn } from '@workspace/ui/lib/utils'

export function SearchModeButtons({
  buttonClassName,
  className,
  options,
  onOptionsChange,
}: {
  buttonClassName?: string
  className?: string
  options: WorkspaceSearchQueryOptions
  onOptionsChange: (options: SearchBufferOptionPatch) => void
}) {
  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      <SearchToggleButton
        active={options.caseSensitive}
        className={buttonClassName}
        label='Match case'
        onClick={() => onOptionsChange({ caseSensitive: !options.caseSensitive })}
      >
        <TextAaIcon className='size-3.5' />
      </SearchToggleButton>
      <SearchToggleButton
        active={options.wholeWord}
        className={buttonClassName}
        label='Match whole word'
        onClick={() => onOptionsChange({ wholeWord: !options.wholeWord })}
      >
        <TextTIcon className='size-3.5' />
      </SearchToggleButton>
      <SearchToggleButton
        active={options.matchMode === 'regex'}
        className={buttonClassName}
        label='Use regular expression'
        onClick={() =>
          onOptionsChange({
            matchMode: options.matchMode === 'regex' ? 'literal' : 'regex',
          })
        }
      >
        <AsteriskIcon className='size-3.5' />
      </SearchToggleButton>
      <SearchToggleButton
        active={options.filtersVisible}
        className={buttonClassName}
        label='Include and exclude files'
        onClick={() => onOptionsChange({ filtersVisible: !options.filtersVisible })}
      >
        <FunnelSimpleIcon className='size-3.5' />
      </SearchToggleButton>
    </div>
  )
}

export function SearchFilterFields({
  className,
  inputClassName,
  options,
  onOptionsChange,
}: {
  className?: string
  inputClassName?: string
  options: WorkspaceSearchQueryOptions
  onOptionsChange: (options: SearchBufferOptionPatch) => void
}) {
  if (!options.filtersVisible) return null

  function handleIncludeChange(event: ChangeEvent<HTMLInputElement>) {
    onOptionsChange({ includeGlobText: event.target.value })
  }

  function handleExcludeChange(event: ChangeEvent<HTMLInputElement>) {
    onOptionsChange({ excludeGlobText: event.target.value })
  }

  return (
    <div className={cn('mt-2 grid grid-cols-2 gap-1.5', className)}>
      <Input
        aria-label='Files to include'
        autoCapitalize='off'
        autoCorrect='off'
        className={cn('h-7 text-[11px]', inputClassName)}
        placeholder='include'
        spellCheck={false}
        value={options.includeGlobText}
        onChange={handleIncludeChange}
      />
      <Input
        aria-label='Files to exclude'
        autoCapitalize='off'
        autoCorrect='off'
        className={cn('h-7 text-[11px]', inputClassName)}
        placeholder='exclude'
        spellCheck={false}
        value={options.excludeGlobText}
        onChange={handleExcludeChange}
      />
    </div>
  )
}

export function SearchReplaceToggleButton({
  active,
  className,
  onToggle,
}: {
  active: boolean
  className?: string
  onToggle: (active: boolean) => void
}) {
  return (
    <Button
      aria-pressed={active}
      className={cn(
        'h-8 shrink-0 px-2 text-[11px] text-muted-foreground hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground',
        className,
      )}
      size='sm'
      title='Toggle replace'
      type='button'
      variant='ghost'
      onClick={() => onToggle(!active)}
    >
      Replace
    </Button>
  )
}

export function SearchReplaceFields({
  buttonClassName,
  canReplace,
  className,
  inputClassName,
  replaceText,
  replaceVisible,
  replacing,
  onReplaceAll,
  onReplaceNext,
  onSelectNextHistory,
  onSelectPreviousHistory,
  onReplaceTextChange,
}: {
  buttonClassName?: string
  canReplace: boolean
  className?: string
  inputClassName?: string
  replaceText: string
  replaceVisible: boolean
  replacing: boolean
  onReplaceAll: () => void
  onReplaceNext: () => void
  onSelectNextHistory: () => void
  onSelectPreviousHistory: () => void
  onReplaceTextChange: (replaceText: string) => void
}) {
  if (!replaceVisible) return null

  return (
    <div className={cn('mt-2 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-1.5', className)}>
      <SearchHistoryInput
        aria-label='Replace in workspace'
        inputClassName={cn('h-7 text-[11px]', inputClassName)}
        label='Replace'
        value={replaceText}
        onSelectNextHistory={onSelectNextHistory}
        onSelectPreviousHistory={onSelectPreviousHistory}
        onValueChange={onReplaceTextChange}
      />
      <Button
        className={cn('h-7 px-2 text-[11px]', buttonClassName)}
        disabled={!canReplace || replacing}
        size='sm'
        type='button'
        variant='outline'
        onClick={onReplaceNext}
      >
        Next
      </Button>
      <Button
        className={cn('h-7 px-2 text-[11px]', buttonClassName)}
        disabled={!canReplace || replacing}
        size='sm'
        type='button'
        variant='outline'
        onClick={onReplaceAll}
      >
        All
      </Button>
    </div>
  )
}

function SearchToggleButton({
  active,
  children,
  className,
  label,
  onClick,
}: {
  active: boolean
  children: ReactNode
  className?: string
  label: string
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            aria-pressed={active}
            className={cn(
              'size-6 text-muted-foreground hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground',
              className,
            )}
            size='icon-xs'
            title={label}
            type='button'
            variant='ghost'
            onClick={onClick}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
