import { ArrowsClockwiseIcon, CheckIcon } from '@phosphor-icons/react'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import type { KeyboardEvent } from 'react'

import { useCommitAction, useSyncChangesMutation } from '../hooks'
import type { RepositoryInfo } from '../types'
import { canSyncChanges, syncChangesLabel } from '../utils/repository'

export function CommitControls({
  hasLocalChanges,
  repository,
  rootPath,
}: {
  hasLocalChanges: boolean
  repository: RepositoryInfo
  rootPath: string
}) {
  const commit = useCommitAction(rootPath)
  const syncChanges = useSyncChangesMutation(rootPath)
  const showSyncChanges = canSyncChanges(repository, hasLocalChanges)
  const inputDisabled = commit.isPending || syncChanges.isPending || showSyncChanges

  function handleCommitKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (showSyncChanges) return
    if (!event.metaKey && !event.ctrlKey) return
    if (event.key !== 'Enter') return

    event.preventDefault()
    commit.submit()
  }

  return (
    <>
      <div className='shrink-0 px-2 pt-1.5'>
        <div className='border-input bg-background focus-within:border-ring focus-within:ring-ring/50 dark:bg-input/30 h-8 border focus-within:ring-1'>
          <Input
            aria-label='Commit message'
            className='h-full border-0 bg-transparent px-2.5 text-xs font-medium shadow-none focus-visible:border-0 focus-visible:ring-0'
            disabled={inputDisabled}
            onChange={(event) => commit.setMessage(event.currentTarget.value)}
            onKeyDown={handleCommitKeyDown}
            placeholder={`Commit Changes (⌘↵ on "${repository.branch ?? 'HEAD'}")`}
            value={showSyncChanges ? '' : commit.message}
          />
        </div>
      </div>
      <div className='shrink-0 px-2 pt-3'>
        {showSyncChanges ? (
          <Button
            className='h-8 w-full text-sm tabular-nums'
            disabled={syncChanges.isPending}
            onClick={() => syncChanges.mutate()}
            type='button'
            variant='default'
          >
            <ArrowsClockwiseIcon
              className={[
                'size-4',
                syncChanges.isPending ? 'animate-spin motion-reduce:animate-none' : '',
              ].join(' ')}
            />
            {syncChangesLabel(repository)}
          </Button>
        ) : (
          <Button
            className='h-8 w-full text-sm'
            disabled={commit.isPending}
            onClick={commit.submit}
            type='button'
            variant='default'
          >
            <CheckIcon className='size-4' />
            Commit
            <span className='text-primary-foreground/65'>⌘↵</span>
          </Button>
        )}
      </div>
    </>
  )
}
