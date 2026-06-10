import { ArrowSquareOutIcon } from '@phosphor-icons/react'

import { SearchSummary } from '@/components/workspace/search/components/search-summary'
import { SearchFilterFields } from '@/features/search/search-filter-fields'
import { SearchHistoryInput } from '@/features/search/search-history-input'
import { SearchModeButtons } from '@/features/search/search-mode-buttons'
import { SearchReplaceFields } from '@/features/search/search-replace-fields'
import { SearchReplaceToggleButton } from '@/features/search/search-replace-toggle-button'
import { useSearchBufferInputs } from '@/features/search/use-search-buffer-inputs'
import { useWorkspaceSearchReplace } from '@/features/search/use-search-replace'
import { createSearchResultsSurface } from '@workspace/tiling/utils/layout-builders'
import { useLayoutState } from '@/features/workbench/hooks/use-layout-state'
import { Button } from '@workspace/ui/components/button'

export function SearchControls({ rootPath }: { rootPath: string }) {
  const {
    query,
    replaceText,
    replaceVisible,
    replacing,
    searchOptions,
    selectNextQuery,
    selectNextReplaceText,
    selectPreviousQuery,
    selectPreviousReplaceText,
    setQuery,
    setReplaceText,
    setReplaceVisible,
    setSearchOptions,
  } = useSearchBufferInputs(rootPath)
  const replace = useWorkspaceSearchReplace(rootPath, replaceVisible)
  const dispatchLayoutOperation = useLayoutState((state) => state.dispatchLayoutOperation)

  function handleOpenSearchResults() {
    dispatchLayoutOperation({
      surface: createSearchResultsSurface(),
      type: 'openSurface',
    })
  }

  return (
    <div className='bg-muted/20 border-b p-1.5'>
      <div className='flex items-center gap-1'>
        <SearchHistoryInput
          aria-label='Search workspace'
          className='flex-1'
          inputClassName='h-7 px-2 pr-[5.5rem] text-[11px]'
          label='Search'
          rightAdornment={
            <SearchModeButtons
              buttonClassName='size-5'
              className='absolute top-1/2 right-0.5 -translate-y-1/2 gap-0'
              options={searchOptions}
              onOptionsChange={setSearchOptions}
            />
          }
          type='search'
          value={query}
          onSelectNextHistory={selectNextQuery}
          onSelectPreviousHistory={selectPreviousQuery}
          onValueChange={setQuery}
        />
        <SearchReplaceToggleButton
          active={replaceVisible}
          className='h-7 px-1.5'
          onToggle={setReplaceVisible}
        />
        <Button
          aria-label='Open search results surface'
          className='text-muted-foreground hover:text-foreground size-7 shrink-0'
          size='icon-sm'
          title='Open search results surface'
          type='button'
          variant='ghost'
          onClick={handleOpenSearchResults}
        >
          <ArrowSquareOutIcon className='size-4' />
        </Button>
      </div>
      <SearchFilterFields
        className='mt-1.5 gap-1'
        inputClassName='h-6 px-1.5 text-[11px]'
        options={searchOptions}
        onOptionsChange={setSearchOptions}
      />
      <SearchReplaceFields
        buttonClassName='h-6 px-1.5 text-[10px]'
        canReplace={replace.canReplace}
        className='mt-1.5 gap-1'
        inputClassName='h-6 px-1.5 text-[11px]'
        replaceText={replaceText}
        replaceVisible={replaceVisible}
        replacing={replacing}
        onReplaceAll={replace.replaceAll}
        onReplaceNext={replace.replaceNext}
        onSelectNextHistory={selectNextReplaceText}
        onSelectPreviousHistory={selectPreviousReplaceText}
        onReplaceTextChange={setReplaceText}
      />
      <SearchSummary rootPath={rootPath} />
    </div>
  )
}
