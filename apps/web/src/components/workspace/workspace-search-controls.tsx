import { ArrowSquareOutIcon } from '@phosphor-icons/react'

import { WorkspaceSearchSummary } from '@/components/workspace/workspace-search-summary'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { SearchHistoryInput } from '@/features/search/search-history-input'
import { searchBufferDocumentId } from '@/features/search/search-buffer-document'
import {
  SearchFilterFields,
  SearchModeButtons,
  SearchReplaceFields,
  SearchReplaceToggleButton,
} from '@/features/search/search-controls'
import { useSearchBufferInputs } from '@/features/search/use-search-buffer-inputs'
import { useWorkspaceSearchReplace } from '@/features/search/use-search-replace'
import { Button } from '@workspace/ui/components/button'

export function WorkspaceSearchControls({ rootPath }: { rootPath: string }) {
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
  const commands = useEditorCommands()

  function handleOpenBuffer() {
    commands.selectFile(searchBufferDocumentId(rootPath))
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
          aria-label='Open search results in editor'
          className='text-muted-foreground hover:text-foreground size-7 shrink-0'
          size='icon-sm'
          title='Open search results in editor'
          type='button'
          variant='ghost'
          onClick={handleOpenBuffer}
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
      <WorkspaceSearchSummary rootPath={rootPath} />
    </div>
  )
}
