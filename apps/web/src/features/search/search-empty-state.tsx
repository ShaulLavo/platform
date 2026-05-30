import { MagnifyingGlassIcon } from '@phosphor-icons/react'

import { SearchCenteredState } from '@/features/search/search-centered-state'

export function SearchEmptyState({
  className,
  description,
  title,
}: {
  className?: string
  description: string
  title: string
}) {
  return (
    <SearchCenteredState className={className}>
      <MagnifyingGlassIcon className='text-muted-foreground size-5' />
      <span className='text-foreground font-medium'>{title}</span>
      <span className='text-muted-foreground max-w-48 text-center text-[11px]'>{description}</span>
    </SearchCenteredState>
  )
}
