import { memo } from 'react'

import { SearchSummary } from '@/features/search/components/summary'
import { useSearchBufferValue } from '@/features/search/hooks/use-buffer-value'

export const SearchBufferSummary = memo(
  ({
    buttonClassName,
    className,
    rootPath,
  }: {
    buttonClassName?: string
    className?: string
    rootPath: string
  }) => {
    const snapshot = useSearchBufferValue(rootPath, (activeSnapshot) => activeSnapshot, null)

    return (
      <SearchSummary
        buttonClassName={buttonClassName}
        className={className}
        query={snapshot?.query ?? ''}
        snapshot={snapshot}
      />
    )
  },
)
