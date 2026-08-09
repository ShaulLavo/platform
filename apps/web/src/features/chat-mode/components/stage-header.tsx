import { GitBranchIcon } from '@phosphor-icons/react'

export function StageHeader({
  branch,
  projectTitle,
  title,
}: {
  readonly branch: string | null
  readonly projectTitle: string | null
  readonly title: string
}) {
  return (
    <header className='flex h-12 shrink-0 flex-col items-center justify-center px-4 text-center'>
      <h1 className='max-w-full truncate text-sm font-semibold'>{title}</h1>
      {projectTitle ? (
        <p className='text-muted-foreground flex max-w-full items-center gap-1.5 text-[11px]'>
          <span className='truncate'>{projectTitle}</span>
          {branch ? (
            <>
              <GitBranchIcon className='size-3 shrink-0' />
              <span className='truncate'>{branch}</span>
            </>
          ) : null}
        </p>
      ) : null}
    </header>
  )
}
