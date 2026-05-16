import { ArrowSquareOutIcon } from "@phosphor-icons/react"

import { useEditorCommands } from "@/features/editor/state/editor-commands"
import { openWorkspaceSearchMatch } from "@/features/search/open-search-match"
import { SearchHistoryInput } from "@/features/search/search-history-input"
import { SearchResultsView } from "@/features/search/search-results-view"
import { SearchSummary } from "@/features/search/search-summary"
import { searchBufferDocumentId } from "@/features/search/search-buffer-document"
import { useSearchBuffer } from "@/features/search/use-search-buffer"
import {
  SearchFilterFields,
  SearchModeButtons,
  SearchReplaceFields,
  SearchReplaceToggleButton,
} from "@/features/search/search-controls"
import { useWorkspaceSearchReplace } from "@/features/search/use-search-replace"
import { Button } from "@workspace/ui/components/button"

export function WorkspaceSearchPane({ rootPath }: { rootPath: string }) {
  const {
    groups,
    query,
    replaceText,
    replaceVisible,
    resultsQuery,
    searchOptions,
    selectNextQuery,
    selectNextReplaceText,
    selectPreviousQuery,
    selectPreviousReplaceText,
    setQuery,
    setReplaceText,
    setReplaceVisible,
    setSearchOptions,
    snapshot,
  } = useSearchBuffer(rootPath)
  const replace = useWorkspaceSearchReplace(rootPath)
  const commands = useEditorCommands()

  function handleOpenBuffer() {
    commands.selectFile(searchBufferDocumentId(rootPath))
  }

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <div className="border-b bg-muted/20 p-1.5">
        <div className="flex items-center gap-1">
          <SearchHistoryInput
            aria-label="Search workspace"
            className="flex-1"
            inputClassName="h-7 px-2 pr-[5.5rem] text-[11px]"
            label="Search"
            rightAdornment={
              <SearchModeButtons
                buttonClassName="size-5"
                className="absolute top-1/2 right-0.5 -translate-y-1/2 gap-0"
                options={searchOptions}
                onOptionsChange={setSearchOptions}
              />
            }
            type="search"
            value={query}
            onSelectNextHistory={selectNextQuery}
            onSelectPreviousHistory={selectPreviousQuery}
            onValueChange={setQuery}
          />
          <SearchReplaceToggleButton
            active={replaceVisible}
            className="h-7 px-1.5"
            onToggle={setReplaceVisible}
          />
          <Button
            aria-label="Open search results in editor"
            className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
            size="icon-sm"
            title="Open search results in editor"
            type="button"
            variant="ghost"
            onClick={handleOpenBuffer}
          >
            <ArrowSquareOutIcon className="size-4" />
          </Button>
        </div>
        <SearchFilterFields
          className="mt-1.5 gap-1"
          inputClassName="h-6 px-1.5 text-[11px]"
          options={searchOptions}
          onOptionsChange={setSearchOptions}
        />
        <SearchReplaceFields
          buttonClassName="h-6 px-1.5 text-[10px]"
          canReplace={replace.canReplace}
          className="mt-1.5 gap-1"
          inputClassName="h-6 px-1.5 text-[11px]"
          replaceText={replaceText}
          replaceVisible={replaceVisible}
          replacing={snapshot?.replaceStatus === "running"}
          onReplaceAll={replace.replaceAll}
          onReplaceNext={replace.replaceNext}
          onSelectNextHistory={selectNextReplaceText}
          onSelectPreviousHistory={selectPreviousReplaceText}
          onReplaceTextChange={setReplaceText}
        />
        <SearchSummary
          buttonClassName="size-[18px]"
          className="mt-1 min-h-4 gap-1 px-0 text-[10px]"
          query={query}
          snapshot={snapshot}
        />
      </div>
      <SearchResultsView
        canReplace={replace.canReplace}
        compact
        groups={groups}
        query={resultsQuery}
        replaceText={replaceText}
        replaceVisible={replaceVisible}
        snapshot={snapshot}
        onOpenMatch={(match) =>
          openWorkspaceSearchMatch(match, resultsQuery, commands)
        }
        onReplaceGroup={replace.replaceGroup}
        onReplaceMatch={replace.replaceMatch}
      />
    </section>
  )
}
