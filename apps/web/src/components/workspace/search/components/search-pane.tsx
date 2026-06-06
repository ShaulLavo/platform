import { memo } from 'react'

import { SearchControls } from '@/components/workspace/search/components/search-controls'
import { SearchResults } from '@/components/workspace/search/components/search-results'

export const SearchPane = memo(({ rootPath }: { rootPath: string }) => {
  return (
    <section className='grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]'>
      <SearchControls rootPath={rootPath} />
      <SearchResults rootPath={rootPath} />
    </section>
  )
})
