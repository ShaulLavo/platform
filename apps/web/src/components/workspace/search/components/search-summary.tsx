import { SearchBufferSummary } from '@/features/search/components/buffer-summary'

export function SearchSummary({ rootPath }: { rootPath: string }) {
  return (
    <SearchBufferSummary
      buttonClassName='size-[18px]'
      className='mt-1 min-h-4 gap-1 px-0 text-[10px]'
      rootPath={rootPath}
    />
  )
}
