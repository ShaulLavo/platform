import { SearchBufferSummary } from '@/features/search/search-buffer-summary'
import { SearchHistoryInput } from '@/features/search/search-history-input'
import {
  SearchFilterFields,
  SearchModeButtons,
  SearchReplaceFields,
  SearchReplaceToggleButton,
} from '@/features/search/search-controls'
import { useSearchBufferInputs } from '@/features/search/use-search-buffer-inputs'
import { useWorkspaceSearchReplace } from '@/features/search/use-search-replace'

export function SearchBufferEditorControls({ rootPath }: { rootPath: string }) {
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

  return (
    <div className='bg-muted/20 border-b px-3 py-2'>
      <div className='flex max-w-2xl items-center gap-1.5'>
        <SearchHistoryInput
          aria-label='Search workspace'
          className='flex-1'
          inputClassName='h-8 pr-28 text-xs'
          label='Search'
          rightAdornment={
            <SearchModeButtons
              className='absolute top-1/2 right-1 -translate-y-1/2'
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
        <SearchReplaceToggleButton active={replaceVisible} onToggle={setReplaceVisible} />
      </div>
      <SearchFilterFields options={searchOptions} onOptionsChange={setSearchOptions} />
      <SearchReplaceFields
        canReplace={replace.canReplace}
        replaceText={replaceText}
        replaceVisible={replaceVisible}
        replacing={replacing}
        onReplaceAll={replace.replaceAll}
        onReplaceNext={replace.replaceNext}
        onSelectNextHistory={selectNextReplaceText}
        onSelectPreviousHistory={selectPreviousReplaceText}
        onReplaceTextChange={setReplaceText}
      />
      <SearchBufferSummary rootPath={rootPath} />
    </div>
  )
}
